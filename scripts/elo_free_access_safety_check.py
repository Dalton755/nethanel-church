#!/usr/bin/env python3
"""Validate Elo free-access SQL offline. No database, network or payment calls."""
from pathlib import Path
import re
from pglast import parse_sql

sql_path = Path("supabase/migrations/20261013182943_elo_free_access_preserve_legacy_billing_v65.sql")
sql = sql_path.read_text(encoding="utf-8")
stmts = parse_sql(sql)
assert len(stmts) >= 10, "Migração incompleta"

def check(condition, message):
    if not condition:
        raise RuntimeError(message)
    print("PASS:", message)

check("code='ELO_REDE'" in sql, "Plano completo está presente no banco")
check("provider_subscription_id is not null" in sql and
      "billing_recurring_authorizations" in sql and
      "raise exception 'Assinaturas externas" in sql,
      "Interrompe mudança caso existam assinaturas externas possivelmente ativas")
check("raise exception 'Autorizações recorrentes de produção" in sql,
      "Interrompe alteração se houver autorização recorrente ativa")
check("auth.uid() is null" in sql and
      "Insufficient organization access" in sql,
      "Consulta de recursos respeita o vínculo autenticado")
check("'effective_plan_code',v_effective_code" in sql and
      "v_effective_code := 'ELO_REDE';" in sql,
      "Recursos completos independentemente do plano histórico")
check("'subscription_status','free'" in sql and
      "'access_ends_at',null" in sql and
      "'price_cents',0" in sql,
      "Nenhum vencimento ou mensalidade para continuar usando o app")
check("'limits',jsonb_build_object('units',null,'people',null)" in sql,
      "Sem limites de pessoas ou unidades")
check("organization_effective_plan_code" in sql and
      "organization_people_limit" in sql,
      "Motores de permissões usam acesso gratuito e sem limite")
check("list_public_elo_plans()" in sql and
      "select '[]'::jsonb" in sql,
      "Planos pagos não são oferecidos a novos usuários")
check("billing_prepare_checkout(" in sql and
      "billing_prepare_checkout_v2(" in sql and
      "billing_prepare_invoice(" in sql and
      "platform_admin_assign_plan(" in sql,
      "Todas as entradas de novas cobranças legadas por RPC bloqueadas")
check("disable trigger zz_organizations_start_elo_complete_trial;" in sql and
      "organizations_elo_initialize" not in sql,
      "Só desativa criação de período de teste, preservando onboarding geral")
check("sync_organization_white_label_entitlement()" in sql and
      "white_label_enabled set default true" in sql,
      "Identidade e personalização abertas para igrejas atuais e novas")
for unsafe in [r"\bdelete\s+from\b",r"\btruncate\b",r"\bdrop\s+table\b",
               r"\bdrop\s+function\b",r"\balter\s+table\s+public\.billing_",
               r"\bupdate\s+public\.billing_",r"\bupdate\s+public\.organization_subscriptions\b"]:
    check(not re.search(unsafe,sql,re.IGNORECASE),
          f"Sem SQL destrutivo ou baixa automática: {unsafe}")
check(not re.search(r"\bupdate\s+public\.subscription_plans\b",sql,re.IGNORECASE),
      "Catálogo histórico dos planos não é alterado")
print(f"\nHomologação da sintaxe de {len(stmts)} comandos SQL concluída.")
print("Não efetua alterações reais nem encerra cobranças antigas do provedor.")
