import re

from odoo import models
from odoo.http import request

from ..controllers.main import fm_settings

# Id de prenda del motor: "import-<uuid>". Otros productos de la categoría (los
# propios de la tienda) no tienen prenda para el probador.
GARMENT_CODE = re.compile(r'^import-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$', re.I)


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    def _fm_experience_category(self):
        """Categoría raíz con la experiencia activada a la que pertenece el producto."""
        self.ensure_one()
        for category in self.public_categ_ids:
            root = category._fm_experience_root()
            if root:
                return root
        return self.env['product.public.category']

    def _fm_probar_values(self):
        """Datos para el botón "Probalo en un modelo" de la ficha, o False.

        Sólo para productos vinculados a una prenda del motor (Referencia interna =
        id de la prenda, la escribe scripts/odoo-sync.mjs) dentro de una categoría
        con la experiencia activada.
        """
        self.ensure_one()
        if not self.default_code or not GARMENT_CODE.match(self.default_code) or not request:
            return False
        settings = fm_settings()
        if not settings:
            return False
        root = self._fm_experience_category()
        if not root:
            return False
        return {
            'garment': self.default_code,
            'moda_url': '/shop/category/%s' % self.env['ir.http']._slug(root),
            **settings,
        }
