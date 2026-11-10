from odoo import fields, models


class ProductPublicCategory(models.Model):
    _inherit = 'product.public.category'

    fm_experience = fields.Boolean(
        string='Experiencia Fashion Market',
        help='Al entrar en esta categoría la tienda muestra arriba de la grilla la experiencia '
             'de Fashion Market (looks en modelo, perchero, fichas, "Tu selección" y probador '
             'virtual) con las prendas publicadas ahí. La grilla de Odoo (precio, carrito, '
             'favoritos) queda debajo; en las subcategorías se ve sólo la grilla, con '
             '"Probalo en un modelo" en las tarjetas de las prendas del probador.',
    )

    def _fm_experience_root(self):
        """Categoría más alta con la experiencia activada entre esta y sus padres."""
        self.ensure_one()
        return self.parents_and_self.filtered('fm_experience')[:1]
