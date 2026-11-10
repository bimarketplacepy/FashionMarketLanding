import json
import logging

import requests
from markupsafe import Markup

from odoo import http, models
from odoo.http import request

from odoo.addons.website_sale.controllers.main import WebsiteSale

_logger = logging.getLogger(__name__)

PARAM = 'website_fashion_market.'

# Rutas del motor que el proxy deja pasar. Nada de /api/admin ni /api/import:
# la administración del catálogo sigue sólo en el workspace del motor.
PROXY_PREFIXES = ('api/landing', 'api/catalog', 'api/tryon/')
FORWARD_HEADERS = ('Content-Type', 'Accept', 'Accept-Language', 'User-Agent')
RETURN_HEADERS = ('Content-Type', 'Cache-Control', 'ETag', 'Last-Modified')
SESSION_COOKIE = 'fm_sid'
SESSION_MAX_AGE = 30 * 24 * 60 * 60

# Con cualquiera de estos parámetros la categoría vuelve a la grilla de Odoo
# (búsqueda, filtros por atributo/etiqueta/precio, orden, paginación).
GRID_PARAMS = ('search', 'attribute_values', 'tags', 'min_price', 'max_price', 'order', 'page')


def fm_settings():
    """URLs del motor según los parámetros del sistema, o {} si no está configurado."""
    params = request.env['ir.config_parameter'].sudo()
    engine = (params.get_param(PARAM + 'engine_url') or '').strip().rstrip('/')
    if not engine.startswith('https://') and not engine.startswith('http://'):
        return {}
    use_proxy = (params.get_param(PARAM + 'use_proxy') or '1').strip() not in ('0', 'false', 'False', '')
    return {
        # API (datos y probador): proxy de Odoo → la cookie fm_sid es de la tienda.
        'base': '/fm' if use_proxy else engine,
        # Imágenes, script y fuentes: directo del motor (no ocupan workers de Odoo).
        'assets': engine,
        'script': '%s/api/embed/fm-embed.js' % engine,
    }


def _json_for_script(value):
    """JSON seguro dentro de <script type="application/json">."""
    text = json.dumps(value, ensure_ascii=False, separators=(',', ':'))
    return Markup(text.replace('<', '\\u003c').replace('>', '\\u003e').replace('&', '\\u0026'))


class FashionMarketShop(WebsiteSale):

    @http.route()
    def shop(self, page=0, category=None, search='', min_price=0.0, max_price=0.0, tags='', **post):
        if isinstance(category, models.BaseModel) and category and not self._fm_grid_requested(page, search, min_price, max_price, tags, post):
            root = category.sudo()._fm_experience_root()
            settings = fm_settings() if root else {}
            if root and settings:
                return self._fm_render(category, root, settings)
            if root:
                _logger.warning('Fashion Market: falta website_fashion_market.engine_url; se muestra la grilla estándar.')
        return super().shop(page=page, category=category, search=search, min_price=min_price,
                            max_price=max_price, tags=tags, **post)

    def _fm_grid_requested(self, page, search, min_price, max_price, tags, post):
        args = request.httprequest.args
        if page or search or tags or post.get('order'):
            return True
        try:
            if float(min_price or 0) or float(max_price or 0):
                return True
        except ValueError:
            return True
        return any(args.get(name) for name in GRID_PARAMS)

    def _fm_render(self, category, root, settings):
        website = request.website
        # Sin sudo: las reglas de acceso del visitante (productos publicados) se aplican.
        domain = [
            ('public_categ_ids', 'child_of', category.id),
            ('is_published', '=', True),
            ('sale_ok', '=', True),
            ('default_code', '!=', False),
        ] + website.website_domain()
        products = request.env['product.template'].search(domain, order='website_sequence, id')
        scope = {
            'category': category.name,
            'products': {product.default_code: product.website_url for product in products},
        }
        values = {
            'category': category,
            'fm_root': root,
            'main_object': category,
            'products': products,
            'fm_view': 'home' if category == root else 'catalogo',
            'fm_scope_json': _json_for_script(scope),
            'fm': settings,
        }
        return request.render('website_fashion_market.fashion_category', values)


class FashionMarketProxy(http.Controller):
    """Proxy de la API del motor bajo /fm/ (mismo dominio que la tienda).

    Así la sesión anónima del probador (cookie fm_sid) es de primera parte y
    Safari/iOS no la bloquea. Sólo deja pasar las rutas públicas del motor.
    """

    @http.route('/fm/<path:subpath>', type='http', auth='public', methods=['GET', 'POST', 'PUT', 'DELETE'],
                csrf=False, sitemap=False, save_session=False)
    def fm_proxy(self, subpath, **kwargs):
        if not subpath.startswith(PROXY_PREFIXES) or '..' in subpath:
            return request.not_found()
        params = request.env['ir.config_parameter'].sudo()
        engine = (params.get_param(PARAM + 'engine_url') or '').strip().rstrip('/')
        if not engine:
            return request.not_found()
        try:
            timeout = int(params.get_param(PARAM + 'proxy_timeout') or 150)
        except ValueError:
            timeout = 150

        httprequest = request.httprequest
        headers = {name: httprequest.headers[name] for name in FORWARD_HEADERS if httprequest.headers.get(name)}
        client_ip = (httprequest.headers.get('X-Forwarded-For') or httprequest.remote_addr or '').split(',')[0].strip()
        if client_ip:
            headers['X-Forwarded-For'] = client_ip
        # Sólo la cookie del probador: la sesión de Odoo nunca sale hacia el motor.
        cookies = {}
        if httprequest.cookies.get(SESSION_COOKIE):
            cookies[SESSION_COOKIE] = httprequest.cookies[SESSION_COOKIE]

        try:
            upstream = requests.request(
                httprequest.method,
                '%s/%s' % (engine, subpath),
                params=httprequest.args.to_dict(flat=False),
                data=httprequest.get_data() if httprequest.method in ('POST', 'PUT') else None,
                headers=headers,
                cookies=cookies,
                timeout=(10, timeout),
                allow_redirects=False,
            )
        except requests.RequestException as error:
            _logger.warning('Fashion Market: el motor no respondió (%s): %s', subpath, error)
            return request.make_json_response(
                {'error': 'El probador no está disponible en este momento. Probá de nuevo en unos minutos.'},
                status=502,
            )

        response = request.make_response(
            upstream.content,
            headers=[(name, upstream.headers[name]) for name in RETURN_HEADERS if upstream.headers.get(name)],
            status=upstream.status_code,
        )
        session_id = upstream.cookies.get(SESSION_COOKIE)
        if session_id:
            response.set_cookie(
                SESSION_COOKIE, session_id, max_age=SESSION_MAX_AGE, path='/fm',
                httponly=True, samesite='Lax', secure=httprequest.scheme == 'https',
            )
        return response
