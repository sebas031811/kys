import re
from typing import Optional


def parse_client_block(text: str, fallback_phone: Optional[str] = None) -> dict:
    raw = (text or "").strip()
    if not raw:
        return {"name": "Sin nombre", "raw_client_text": raw}

    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    name = lines[0] if lines else raw
    if len(name) > 120 and "\n" not in raw[:120]:
        name = name[:120]

    identification = None
    phone = fallback_phone
    email = None
    address = None

    id_patterns = [
        r"(?:c\.?c\.?|cédula|cedula)\s*[:\s]*([\d.\s]+)",
        r"\b(\d{7,12})\b",
    ]
    for pat in id_patterns:
        m = re.search(pat, raw, re.IGNORECASE)
        if m:
            identification = re.sub(r"\s+", "", m.group(1).replace(".", ""))
            break

    phone_m = re.search(r"(?:celular|tel[eé]fono|phone)?\s*[:\s]*(\d{10})", raw, re.IGNORECASE)
    if phone_m:
        phone = phone_m.group(1)
    elif not phone:
        phone_m2 = re.search(r"\b3\d{9}\b", raw)
        if phone_m2:
            phone = phone_m2.group(0)

    email_m = re.search(r"[\w.+-]+@[\w.-]+\.\w+", raw)
    if email_m:
        email = email_m.group(0)

    addr_m = re.search(r"(?:direcci[oó]n|address)\s*[:\s]*(.+)", raw, re.IGNORECASE)
    if addr_m:
        address = addr_m.group(1).split("\n")[0].strip()

    return {
        "name": name,
        "phone": phone,
        "identification": identification,
        "email": email,
        "address": address,
        "raw_client_text": raw,
    }
