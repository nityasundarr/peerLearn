from supabase import Client, create_client

from app.core.config import settings

# Module-level singleton — Python's import system ensures this runs exactly once.
# All DB query functions import `supabase` directly from this module.
supabase: Client = create_client(
    settings.SUPABASE_URL,
    settings.SUPABASE_SERVICE_ROLE_KEY,
)
