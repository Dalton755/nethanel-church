import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import {
  formatMoneyInputBr,
  maskMoneyBr,
  parseMoneyBr,
} from "../../lib/inputMasks";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "./EloUi";

const P = Phosphor as any;

type OfferingEntry = {
  event_id: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  unit_id: string;
  closure_id: string | null;
  status: "draft" | "submitted" | "approved";
  cash_amount: number | string;
  pix_amount: number | string;
  card_amount: number | string;
  other_amount: number | string;
  total_amount: number | string;
  notes: string | null;
  submitted_at: string | null;
  approved_at: string | null;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ServiceOfferingEntryScreen({
  eventId,
  onBack,
  onSaved,
}: {
  eventId: string;
  onBack: () => void;
  onSaved?: () => Promise<void> | void;
}) {
  const { activeOrganization } = useOrganization();

  const [entry, setEntry] = useState<OfferingEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cash, setCash] = useState("0");
  const [pix, setPix] = useState("0");
  const [card, setCard] = useState("0");
  const [other, setOther] = useState("0");
  const [notes, setNotes] = useState("");

  const locked =
    entry?.status === "submitted" || entry?.status === "approved";

  const total = useMemo(
    () =>
      [cash, pix, card, other].reduce((sum, value) => {
        const parsed = parseMoneyBr(value);
        return sum + (Number.isFinite(parsed) ? parsed : 0);
      }, 0),
    [cash, pix, card, other]
  );

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.rpc(
        "get_my_service_offering_entry",
        {
          p_organization_id: activeOrganization.id,
          p_event_id: eventId,
        }
      );

      if (error) throw error;

      const next = ((data ?? [])[0] ?? null) as OfferingEntry | null;

      setEntry(next);

      if (next) {
        setCash(formatMoneyInputBr(next.cash_amount));
        setPix(formatMoneyInputBr(next.pix_amount));
        setCard(formatMoneyInputBr(next.card_amount));
        setOther(formatMoneyInputBr(next.other_amount));
        setNotes(next.notes ?? "");
      }
    } catch (error) {
      Alert.alert(
        "Oferta do culto",
        error instanceof Error
          ? error.message
          : "Não foi possível abrir este lançamento."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(submit: boolean) {
    if (!activeOrganization || locked) return;

    const values = [cash, pix, card, other].map(parseMoney);

    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      Alert.alert(
        "Valores inválidos",
        "Revise os valores informados."
      );
      return;
    }

    if (values.reduce((sum, value) => sum + value, 0) <= 0) {
      Alert.alert(
        "Nenhum valor informado",
        "Informe ao menos um valor recolhido."
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "save_my_service_offering_entry",
        {
          p_organization_id: activeOrganization.id,
          p_event_id: eventId,
          p_cash_amount: values[0],
          p_pix_amount: values[1],
          p_card_amount: values[2],
          p_other_amount: values[3],
          p_notes: notes.trim() || null,
          p_submit: submit,
        }
      );

      if (error) throw error;

      await load();
      await onSaved?.();

      if (submit) {
        Alert.alert(
          "Valores enviados",
          "O financeiro recebeu o fechamento para conferência. Depois do envio, os valores ficam bloqueados para evitar alterações."
        );
      }
    } catch (error) {
      Alert.alert(
        "Não foi possível salvar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <EloScreen
      title="Oferta do culto"
      eyebrow="ELO • SERVIR"
      subtitle="Acesso liberado para quem foi escalado na função de oferta nesta data."
      onBack={onBack}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : !entry ? (
        <EloState
          title="Lançamento indisponível"
          description="Este acesso só fica disponível no dia do culto para quem está confirmado na função de oferta."
          icon="WarningCircleIcon"
        />
      ) : (
        <>
          <View style={styles.eventCard}>
            <View style={styles.eventIcon}>
              <P.HandCoinsIcon
                size={23}
                color={eloColors.blue}
                weight="duotone"
              />
            </View>

            <View style={styles.grow}>
              <Text style={styles.eventTitle}>{entry.event_title}</Text>
              <Text style={styles.eventDate}>
                {formatDateTime(entry.starts_at)}
              </Text>
            </View>
          </View>

          {locked ? (
            <View style={styles.lockedBox}>
              <P.ShieldCheckIcon
                size={20}
                color={eloColors.green}
                weight="duotone"
              />
              <View style={styles.grow}>
                <Text style={styles.lockedTitle}>
                  {entry.status === "approved"
                    ? "Fechamento conferido"
                    : "Enviado para conferência"}
                </Text>
                <Text style={styles.lockedText}>
                  Os valores não podem mais ser alterados por quem recolheu a oferta.
                </Text>
              </View>
            </View>
          ) : null}

          <EloCard>
            <Text style={eloSharedStyles.cardTitle}>
              Valores recolhidos
            </Text>
            <Text style={eloSharedStyles.cardText}>
              Informe apenas os valores deste culto. O financeiro fará a conferência final.
            </Text>

            <Text style={styles.label}>Dinheiro</Text>
            <TextInput
              value={cash}
              onChangeText={(value) => setCash(maskMoneyBr(value))}
              editable={!locked}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#A1A9B0"
              style={[styles.input, locked && styles.inputLocked]}
            />

            <Text style={styles.label}>PIX</Text>
            <TextInput
              value={pix}
              onChangeText={(value) => setPix(maskMoneyBr(value))}
              editable={!locked}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#A1A9B0"
              style={[styles.input, locked && styles.inputLocked]}
            />

            <Text style={styles.label}>Maquininha / cartão</Text>
            <TextInput
              value={card}
              onChangeText={(value) => setCard(maskMoneyBr(value))}
              editable={!locked}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#A1A9B0"
              style={[styles.input, locked && styles.inputLocked]}
            />

            <Text style={styles.label}>Outros</Text>
            <TextInput
              value={other}
              onChangeText={(value) => setOther(maskMoneyBr(value))}
              editable={!locked}
              keyboardType="decimal-pad"
              placeholder="0,00"
              placeholderTextColor="#A1A9B0"
              style={[styles.input, locked && styles.inputLocked]}
            />

            <Text style={styles.label}>Observações</Text>
            <TextInput
              value={notes}
              onChangeText={setNotes}
              editable={!locked}
              multiline
              placeholder="Ex.: valor conferido por duas pessoas"
              placeholderTextColor="#A1A9B0"
              style={[
                styles.input,
                styles.textarea,
                locked && styles.inputLocked,
              ]}
            />

            <View style={styles.totalBox}>
              <Text style={styles.totalLabel}>Total informado</Text>
              <Text style={styles.totalValue}>{money(total)}</Text>
            </View>

            {!locked ? (
              <View style={styles.actions}>
                <EloActionButton
                  label="Salvar rascunho"
                  variant="secondary"
                  loading={saving}
                  onPress={() => void save(false)}
                />

                <EloActionButton
                  label="Enviar para conferência"
                  icon="ShieldCheckIcon"
                  loading={saving}
                  onPress={() => void save(true)}
                />
              </View>
            ) : null}
          </EloCard>
        </>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  eventCard: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: 17,
    backgroundColor: "#EAF5FB",
  },
  eventIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  eventDate: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: "700",
    color: eloColors.muted,
  },
  lockedBox: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 14,
    backgroundColor: "#ECF8F1",
  },
  lockedTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.green,
  },
  lockedText: {
    marginTop: 3,
    fontSize: 10,
    lineHeight: 15,
    color: "#587265",
  },
  grow: {
    flex: 1,
  },
  label: {
    marginTop: 15,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: eloColors.ink,
  },
  inputLocked: {
    backgroundColor: "#F3F5F7",
    color: eloColors.muted,
  },
  textarea: {
    minHeight: 86,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  totalBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F3F6F8",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  totalValue: {
    marginTop: 4,
    fontSize: 24,
    fontWeight: "900",
    color: eloColors.ink,
  },
  actions: {
    marginTop: 16,
    gap: 8,
  },
});
