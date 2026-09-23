import io
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

sys.path.insert(0, r"D:\DB-GPT\backend\dbgpt-analyst\src")
sys.path.insert(0, r"D:\DB-GPT\backend\dbgpt-serve\src")
sys.path.insert(0, r"D:\DB-GPT\backend\dbgpt-core\src")
sys.path.insert(0, r"D:\DB-GPT\backend\dbgpt-ext\src")

from dbgpt_analyst.middleware.verification_gate import (
    _NUMBER_PATTERN,
    _parse_number_value,
    verify_numerical_claims,
    strip_ungrounded_claims,
)

text = "Doanh thu dat 450.000₫ va 450.000đ va 12.85 tỷ đồng va $500M"
matches = [m.group() for m in _NUMBER_PATTERN.finditer(text)]
print("Matches in text:", matches)
for m in matches:
    print(repr(m), "-> parsed:", _parse_number_value(m))

gt = [{"val": 450000}, {"val": 12850000000}]
valid, ungrounded = verify_numerical_claims(text, gt)
print("verify_numerical_claims result:", valid, "ungrounded:", ungrounded)
