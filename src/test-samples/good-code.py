"""Sample code with CORRECT resilience patterns — used for Faultline testing.
This file shows the fixed version of every anti-pattern.
"""
import requests
import json
import time
import logging
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from sqlalchemy import create_engine

logger = logging.getLogger(__name__)

# Retry session
def create_retry_session(retries=3, backoff_factor=0.5):
    session = requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=(429, 500, 502, 503, 504),
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session


# ✅ TIMEOUT + RETRY
def charge_user(user_id, amount):
    session = create_retry_session()
    response = session.post(
        "https://api.stripe.com/v1/charges",
        json={"user_id": user_id, "amount": amount},
        timeout=(3, 10)  # ✅ 3s connect, 10s read timeout
    )
    response.raise_for_status()
    return response.json()


# ✅ RETRY + IDEMPOTENT
def process_payment(user_id, amount, idempotency_key):
    db = create_engine(
        "postgresql://localhost/payments",
        pool_size=10, max_overflow=5, pool_timeout=30  # ✅ Bounded pool
    )
    # ✅ Idempotency key prevents duplicates on retry
    db.execute(
        "INSERT INTO charges (user_id, amount, idempotency_key) "
        "VALUES (:uid, :amt, :key) "
        "ON CONFLICT (idempotency_key) DO NOTHING",
        {"uid": user_id, "amt": amount, "key": idempotency_key}
    )
    return True


# ✅ PROPER ERROR HANDLING
def send_receipt(user_id, amount):
    try:
        response = requests.post(
            "https://email-api.internal/send",
            json={"to": user_id, "template": "receipt", "amount": amount},
            timeout=5
        )
        response.raise_for_status()
    except requests.exceptions.RequestException as e:
        logger.error(f"Receipt email failed for user {user_id}: {e}")  # ✅ Logged
        # Could also: push to retry queue, alert on-call, etc.
        raise  # ✅ Re-raise so caller knows


# ✅ BOUNDED POOL
def get_db_connection():
    return create_engine(
        "postgresql://localhost/mydb",
        pool_size=10,       # ✅ Max 10 connections
        max_overflow=5,     # ✅ 5 overflow allowed
        pool_timeout=30,    # ✅ 30s wait before giving up
        pool_recycle=1800,  # ✅ Recycle connections every 30min
    )


# ✅ RATE LIMIT HANDLING
def sync_to_stripe(customers):
    session = create_retry_session(retries=5, backoff_factor=1.0)
    for customer in customers:
        response = session.post(
            "https://api.stripe.com/v1/customers",
            json=customer,
            timeout=(3, 10)
        )  # ✅ Session handles 429 with backoff automatically
        response.raise_for_status()


# ✅ CIRCUIT BREAKER / FALLBACK
def get_user_dashboard(user_id):
    dashboard = {}
    for service_name, url in [
        ("user", f"http://user-service/api/users/{user_id}"),
        ("orders", f"http://order-service/api/orders?user={user_id}"),
        ("payments", f"http://payment-service/api/payments?user={user_id}"),
    ]:
        try:
            resp = requests.get(url, timeout=3)  # ✅ Timeout per call
            resp.raise_for_status()
            dashboard[service_name] = resp.json()
        except requests.exceptions.RequestException as e:
            logger.warning(f"{service_name} unavailable: {e}")
            dashboard[service_name] = None  # ✅ Graceful degradation
    return dashboard


# ✅ DEAD LETTER QUEUE
def process_queue_message(message, sqs_client, dlq_url, max_receive_count=3):
    receive_count = int(message.get("Attributes", {}).get("ApproximateReceiveCount", 1))
    try:
        data = json.loads(message["Body"])
        charge_user(data["user_id"], data["amount"])
    except Exception as e:
        if receive_count >= max_receive_count:
            logger.error(f"Message failed {receive_count} times, sending to DLQ: {e}")
            sqs_client.send_message(  # ✅ Send to dead letter queue
                QueueUrl=dlq_url,
                MessageBody=message["Body"],
                MessageAttributes={"Error": {"StringValue": str(e), "DataType": "String"}}
            )
        else:
            raise  # ✅ Let it retry via visibility timeout
