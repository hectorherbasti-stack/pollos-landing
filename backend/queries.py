"""Consultas compatibles con el esquema existente; precios en céntimos."""

PRODUCTS = """
    SELECT
      id,
      name,
      description,
      emoji,
      sale_price_cents AS "salePriceCents",
      cost_price_cents AS "costPriceCents"
    FROM products
    WHERE active = TRUE
    ORDER BY id
  """

TOTALS = """
      SELECT
        COALESCE(SUM(quantity), 0) AS units,
        COALESCE(SUM(quantity * unit_price_cents), 0) AS "revenueCents",
        COALESCE(SUM(quantity * unit_cost_cents), 0) AS "costCents",
        COALESCE(SUM(quantity * (unit_price_cents - unit_cost_cents)), 0) AS "profitCents"
      FROM sales
    """

BY_PRODUCT = """
      SELECT
        p.name,
        p.emoji,
        COALESCE(SUM(s.quantity), 0) AS units,
        COALESCE(SUM(s.quantity * s.unit_price_cents), 0) AS "revenueCents",
        COALESCE(SUM(s.quantity * (s.unit_price_cents - s.unit_cost_cents)), 0) AS "profitCents"
      FROM products p
      LEFT JOIN sales s ON s.product_id = p.id
      GROUP BY p.id
      ORDER BY "revenueCents" DESC
    """

RECENT_SALES = """
      SELECT
        s.id,
        p.name,
        p.emoji,
        s.quantity,
        s.quantity * s.unit_price_cents AS "totalCents",
        s.quantity * (s.unit_price_cents - s.unit_cost_cents) AS "profitCents",
        s.sold_at AS "soldAt"
      FROM sales s
      JOIN products p ON p.id = s.product_id
      ORDER BY s.id DESC
      LIMIT 12
    """

INSERT_SALE = """
      INSERT INTO sales (
        product_id,
        quantity,
        unit_price_cents,
        unit_cost_cents
      )
      SELECT
        id,
        %s,
        sale_price_cents,
        cost_price_cents
      FROM products
      WHERE id = %s AND active = TRUE
      RETURNING id
    """