"""Sample code with resilience anti-patterns — used for Faultline testing.
This file intentionally contains EVERY anti-pattern Faultline detects.
"""
import requests
import json
from sqlalchemy import create_engine

# --- MISSING_TIMEOUT (Line ~10) ---
def charge_user(user_id, amount):
    """Charge a user's credit card via payment API."""
    response = requests.post(
        "https://api.stripe.com/v1/charges",
        json={"user_id": user_id, "amount": amount}
    )  # No timeout — will block forever if Stripe is slow
    return response.json()


# --- MISSING_RETRY (Line ~20) ---
def save_order(order_data):
    """Save order to database."""
    db = create_engine("postgresql://localhost/orders")
    result = db.execute(
        "INSERT INTO orders (data) VALUES (:data)",
        {"data": json.dumps(order_data)}
    )  # No retry — transient DB failure = lost order
    return result


# --- NON_IDEMPOTENT (Line ~31) ---
def process_payment(user_id, amount, order_id):
    """Process a payment — called by the retry queue."""
    db = create_engine("postgresql://localhost/payments")
    db.execute(
        "INSERT INTO charges (user_id, amount) VALUES (:uid, :amt)",
        {"uid": user_id, "amt": amount}
    )  # No idempotency key — retry = duplicate charge!
    return True


# --- SILENT_EXCEPTION (Line ~42) ---
def send_receipt(user_id, amount):
    """Send receipt email after successful charge."""
    try:
        email_service = requests.post(
            "https://email-api.internal/send",
            json={"to": user_id, "template": "receipt", "amount": amount}
        )
    except:
        pass  # Silent swallow — user never gets receipt, nobody knows


# --- UNBOUNDED_POOL (Line ~53) ---
def get_db_connection():
    """Create database connection pool."""
    engine = create_engine(
        "postgresql://localhost/mydb"
    )  # No pool_size, max_overflow — unbounded connections
    return engine


# --- RATE_LIMIT_UNHANDLED (Line ~61) ---
def sync_to_stripe(customers):
    """Sync all customers to Stripe."""
    for customer in customers:
        response = requests.post(
            "https://api.stripe.com/v1/customers",
            json=customer
        )  # No 429 handling — Stripe rate-limits at 100 req/s
        if response.status_code != 200:
            raise Exception(f"Stripe error: {response.status_code}")


# --- CASCADE_UNGUARDED (Line ~72) ---
def get_user_dashboard(user_id):
    """Load user dashboard — calls 3 services synchronously."""
    user = requests.get(f"http://user-service/api/users/{user_id}").json()
    orders = requests.get(f"http://order-service/api/orders?user={user_id}").json()
    payments = requests.get(f"http://payment-service/api/payments?user={user_id}").json()
    # If ANY service is down, the entire dashboard fails
    # No circuit breaker, no fallback, no timeout
    return {"user": user, "orders": orders, "payments": payments}


# --- NO_DEAD_LETTER (Line ~82) ---
def process_queue_message(message):
    """Process message from SQS queue."""
    data = json.loads(message["Body"])
    result = charge_user(data["user_id"], data["amount"])
    # If processing fails repeatedly, message stays in queue forever
    # No DLQ, no max receive count, no poison message handling
    return result
