"""Optional cotizador-style credit formula (Slides / legacy quotes)."""


def credit_installment(financed: float, rate: float, installments: int) -> float:
    if installments <= 0 or financed <= 0:
        return 0.0
    effective_rate = rate / 100 if rate > 1 else rate
    return round(financed * (1 + effective_rate) / installments)
