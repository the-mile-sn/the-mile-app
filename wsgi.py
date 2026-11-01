from app import application, initialize

# Renewals are informational. Do not start the legacy notification scheduler.
# Database initialization and the WSGI application remain unchanged.
initialize()
