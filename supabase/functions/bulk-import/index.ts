import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    const { entries } = await req.json();
    
    if (!entries || !Array.isArray(entries)) {
      return new Response(JSON.stringify({ error: "entries array required" }), { 
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
      });
    }

    // Get all contacts for name->id mapping
    const { data: contacts } = await supabaseAdmin.from("contacts").select("id, name");
    const nameToId: Record<string, string> = {};
    for (const c of contacts || []) {
      nameToId[c.name] = c.id;
    }

    // Map entries with contact_id
    const mapped = entries.map((e: any) => ({
      contact_id: nameToId[e.contact_name],
      date: e.date,
      description: e.description,
      debit: e.debit,
      credit: e.credit,
      balance: e.balance,
    })).filter((e: any) => e.contact_id);

    // Insert in batches of 500
    let inserted = 0;
    for (let i = 0; i < mapped.length; i += 500) {
      const batch = mapped.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("ledger_entries").insert(batch);
      if (error) {
        return new Response(JSON.stringify({ error: error.message, inserted }), { 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        });
      }
      inserted += batch.length;
    }

    return new Response(JSON.stringify({ success: true, inserted, total: entries.length }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), { 
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
