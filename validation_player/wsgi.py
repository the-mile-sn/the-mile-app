from app import application, initialize

# Test environment: renewal notification scheduler is deliberately disabled.
# Keep database initialization and the WSGI application unchanged.
initialize()
