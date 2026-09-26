"""
Password hashing utilities — uses bcrypt directly (passlib-free) to avoid
Python 3.13 / bcrypt 5.x compatibility issues.
"""
import bcrypt


def hash_password(password: str) -> str:
    """Hash a plain-text password and return the hash as a string."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    """Verify a plain-text password against a stored hash."""
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False
