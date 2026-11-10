{
    'name': 'Fashion Market — experiencia de moda',
    'summary': 'Looks en modelo, perchero, fichas, "Tu selección" y probador virtual IA en la categoría Moda de la tienda',
    'description': """
La categoría web marcada como "Experiencia Fashion Market" muestra, arriba de la
grilla de productos de Odoo, la experiencia editorial de Fashion Market con las
prendas publicadas en esa categoría. La grilla (precio, carrito, favoritos) queda
igual; las tarjetas y las fichas de las prendas del probador suman "Probalo en
un modelo".

La IA, las imágenes y los looks viven en el motor (deployment de Replit). Este
módulo sólo inserta el widget y hace de proxy de la API del motor bajo /fm/
para que la sesión del probador sea una cookie del mismo dominio que la tienda.
""",
    'version': '19.0.1.1.0',
    'category': 'Website/Website',
    'author': 'Fashion Market — By Marketplace',
    'license': 'LGPL-3',
    'depends': ['website_sale'],
    'data': [
        'data/ir_config_parameter.xml',
        'views/product_public_category_views.xml',
        'views/templates.xml',
    ],
    'installable': True,
    'application': False,
}
