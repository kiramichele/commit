# ============================================================
# COMMIT PLATFORM — Supabase Client (Backend)
# ============================================================
# Two clients:
#   supabase_anon    — uses anon key, respects RLS
#   supabase_admin   — uses service role key, bypasses RLS
#
# Use supabase_admin ONLY for:
#   - Creating student accounts
#   - Admin operations
#   - Server-side operations that legitimately need full access
#
# Use supabase_anon (or user-scoped client) for everything else.
# ============================================================

from supabase import create_client, Client
from dotenv import load_dotenv
import os

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_ANON_KEY or not SUPABASE_SERVICE_ROLE_KEY:
    raise RuntimeError(
        "Missing Supabase environment variables. "
        "Make sure SUPABASE_URL, SUPABASE_ANON_KEY, and "
        "SUPABASE_SERVICE_ROLE_KEY are set in your .env file."
    )

# Anon client — respects Row Level Security
supabase_anon: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

# Admin client — bypasses RLS (use sparingly)
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def get_user_client(access_token: str) -> Client:
    """
    Returns a Supabase client scoped to a specific user's JWT.
    RLS policies will apply as that user. Use this for most
    authenticated operations.
    """
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client