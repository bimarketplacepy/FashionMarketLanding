from odoo import fields, models


class ProductPublicCategory(models.Model):
    _inherit = 'product.public.category'

    fm_experience = fields.Boolean(
        string='Experiencia Fashion Market',
        help='Al entrar en esta categoría (o en cualquiera de sus subcategorías) la tienda '
             'muestra la experiencia de Fashion Market (looks en modelo, perchero, fichas, '
             '"Tu selección" y probador virtual) con las prendas publicadas ahí, en lugar de '
             'la grilla estándar. Las búsquedas y filtros siguen usando la grilla de Odoo.',
    )

    def _fm_experience_root(self):
        """Categoría más alta con la experiencia activada entre esta y sus padres."""
        self.ensure_one()
        return self.parents_and_self.filtered('fm_experience')[:1]
