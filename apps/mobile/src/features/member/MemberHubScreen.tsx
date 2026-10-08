import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";
import * as Clipboard from "expo-clipboard";

import { useOrganization } from "../../contexts/OrganizationContext";
import { useChurchStructure } from "../organization/useChurchStructure";
import { supabase } from "../../lib/supabase";
import { EventsScreen } from "../elo/EventsScreen";
import { KidsScreen } from "../elo/KidsScreen";
import { SchedulesScreen } from "../elo/SchedulesScreen";
import {
  EloActionButton,
  EloCard,
  EloModuleCard,
  EloScreen,
  EloState,
  eloColors,
} from "../elo/EloUi";

const P = Phosphor as any;

export type MemberModuleKey =
  | "prayer"
  | "pastoral"
  | "contribution"
  | "events"
  | "kids"
  | "schedules";

type PrayerRequest = {
  request_id: string;
  message: string;
  visibility: string;
  status: string;
  response_text: string | null;
  responded_at: string | null;
  created_at: string;
  updated_at: string;
};

type PastoralRequest = {
  request_id: string;
  reason: string;
  availability_notes: string | null;
  status: string;
  proposed_start_at: string | null;
  proposed_end_at: string | null;
  proposal_note: string | null;
  member_response_note: string | null;
  member_responded_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ContributionInfo = {
  enabled?: boolean;
  pix_key_type?: string | null;
  pix_key?: string | null;
  pix_copy_paste?: string | null;
  beneficiary_name?: string | null;
  bank_name?: string | null;
  instructions?: string | null;
};

type MemberHubProps = {
  route?: {
    params?: {
      module?: MemberModuleKey | string;
      nonce?: number;
    };
  };
};

const prayerStatus: Record<string, string> = {
  RECEIVED: "Recebido",
  IN_PRAYER: "Em oração",
  ANSWERED: "Respondido",
  CLOSED: "Concluído",
};

const pastoralStatus: Record<string, string> = {
  REQUESTED: "Aguardando retorno",
  PROPOSED: "Horário proposto",
  CONFIRMED: "Confirmado",
  RESCHEDULE_REQUESTED: "Novo horário solicitado",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MemberHubScreen({ route }: MemberHubProps) {
  const {
    activeOrganization,
    can,
    canAtOrganization,
  } = useOrganization();

  const [activeModule, setActiveModule] =
    useState<MemberModuleKey | null>(null);
  const { structure } = useChurchStructure(activeModule);
  const kidsEnabled = structure?.configured !== true ||
    structure.departments.some((item) => item.key === "infantil");

  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [pastoral, setPastoral] = useState<PastoralRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const requested = route?.params?.module;

    if (
      requested === "prayer" ||
      requested === "pastoral" ||
      requested === "contribution" ||
      requested === "events" ||
      requested === "kids" ||
      requested === "schedules"
    ) {
      setActiveModule(requested);
    }
  }, [route?.params?.module, route?.params?.nonce]);

  const loadSummary = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [prayerResponse, pastoralResponse] = await Promise.all([
      supabase.rpc("list_my_prayer_requests", {
        p_organization_id: activeOrganization.id,
      }),
      supabase.rpc("list_my_pastoral_requests", {
        p_organization_id: activeOrganization.id,
      }),
    ]);

    if (!prayerResponse.error) {
      setPrayers((prayerResponse.data ?? []) as PrayerRequest[]);
    }

    if (!pastoralResponse.error) {
      setPastoral((pastoralResponse.data ?? []) as PastoralRequest[]);
    }

    setLoading(false);
  }, [activeOrganization]);

  useEffect(() => {
    if (!activeModule) {
      void loadSummary();
    }
  }, [activeModule, loadSummary]);

  const canUseKids =
    can("kids.parent") ||
    canAtOrganization("kids.parent") ||
    can("kids.manage") ||
    canAtOrganization("kids.manage");

  if (activeModule === "prayer") {
    return <PrayerRequestsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "pastoral") {
    return <PastoralRequestsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "contribution") {
    return <ContributionScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "events") {
    return <EventsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "kids" && kidsEnabled) {
    return <KidsScreen onBack={() => setActiveModule(null)} />;
  }

  if (activeModule === "schedules") {
    return <SchedulesScreen onBack={() => setActiveModule(null)} />;
  }

  const pendingPastoral =
    pastoral.find((item) => item.status === "PROPOSED") ??
    pastoral.find((item) =>
      ["REQUESTED", "RESCHEDULE_REQUESTED", "CONFIRMED"].includes(item.status)
    ) ??
    null;

  const latestPrayer = prayers[0] ?? null;

  return (
    <EloScreen
      title="Meu Elo"
      eyebrow="MINHA VIDA NA IGREJA"
      subtitle="Acompanhe suas solicitações, respostas e compromissos em um só lugar."
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          {pendingPastoral?.status === "PROPOSED" ? (
            <Pressable
              onPress={() => setActiveModule("pastoral")}
              style={({ pressed }) => [
                styles.attentionCard,
                pressed && styles.pressed,
              ]}
            >
              <View style={styles.attentionIcon}>
                <P.CalendarCheckIcon
                  size={23}
                  color={eloColors.blue}
                  weight="duotone"
                />
              </View>
              <View style={styles.flex}>
                <Text style={styles.attentionKicker}>PRECISA DA SUA RESPOSTA</Text>
                <Text style={styles.attentionTitle}>
                  Horário de atendimento proposto
                </Text>
                {pendingPastoral.proposed_start_at ? (
                  <Text style={styles.attentionMeta}>
                    {formatDateTime(pendingPastoral.proposed_start_at)}
                  </Text>
                ) : null}
              </View>
              <P.CaretRightIcon size={18} color="#9AA4AE" weight="bold" />
            </Pressable>
          ) : null}

          <EloModuleCard
            icon="HandsPrayingIcon"
            title="Meus pedidos de oração"
            description={
              latestPrayer
                ? `Último pedido: ${prayerStatus[latestPrayer.status] ?? latestPrayer.status}`
                : "Envie um pedido e acompanhe o retorno da igreja."
            }
            badge={prayers.length > 0 ? String(prayers.length) : undefined}
            onPress={() => setActiveModule("prayer")}
          />

          <EloModuleCard
            icon="ChatCenteredDotsIcon"
            title="Atendimento pastoral"
            description={
              pendingPastoral
                ? pastoralStatus[pendingPastoral.status] ?? pendingPastoral.status
                : "Solicite atendimento e acompanhe a definição do horário."
            }
            badge={
              pendingPastoral?.status === "PROPOSED"
                ? "Responder"
                : undefined
            }
            onPress={() => setActiveModule("pastoral")}
          />

          <EloModuleCard
            icon="HeartIcon"
            title="Contribuir"
            description="Consulte as informações Pix fornecidas pela sua igreja."
            onPress={() => setActiveModule("contribution")}
          />

          <EloModuleCard
            icon="TicketIcon"
            title="Meus eventos"
            description="Inscrições, próximos encontros e check-in."
            onPress={() => setActiveModule("events")}
          />

          {canUseKids && kidsEnabled ? (
            <EloModuleCard
              icon="BabyIcon"
              title="Elo Kids"
              description="Cadastre seus filhos e acompanhe check-in e retirada."
              onPress={() => setActiveModule("kids")}
            />
          ) : null}

          <EloModuleCard
            icon="ClipboardTextIcon"
            title="Minhas escalas"
            description="Veja quando e onde você está escalado para servir."
            onPress={() => setActiveModule("schedules")}
          />
        </>
      )}
    </EloScreen>
  );
}

function PrayerRequestsScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization } = useOrganization();

  const [items, setItems] = useState<PrayerRequest[]>([]);
  const [message, setMessage] = useState("");
  const [visibility, setVisibility] =
    useState<"PASTORAL" | "PRAYER_TEAM">("PASTORAL");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) return;

    setLoading(true);
    const { data, error } = await supabase.rpc("list_my_prayer_requests", {
      p_organization_id: activeOrganization.id,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setItems((data ?? []) as PrayerRequest[]);
      setErrorMessage(null);
    }

    setLoading(false);
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!activeOrganization || message.trim().length < 5) return;

    setSaving(true);
    setErrorMessage(null);

    const { error } = await supabase.rpc("create_prayer_request", {
      p_organization_id: activeOrganization.id,
      p_message: message.trim(),
      p_visibility: visibility,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setMessage("");
      setShowForm(false);
      await load();
    }

    setSaving(false);
  }

  return (
    <EloScreen
      title="Pedidos de oração"
      eyebrow="MEU ELO"
      subtitle="Seu pedido fica registrado para você acompanhar o cuidado da igreja."
      onBack={onBack}
      right={
        <Pressable onPress={() => setShowForm((current) => !current)} style={styles.iconButton}>
          <P.PlusIcon size={20} color={eloColors.ink} weight="bold" />
        </Pressable>
      }
    >
      {showForm ? (
        <EloCard style={styles.formCard}>
          <Text style={styles.formTitle}>Novo pedido</Text>
          <Text style={styles.label}>Como podemos orar por você?</Text>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Escreva seu pedido..."
            multiline
            textAlignVertical="top"
            style={styles.textArea}
          />

          <Text style={styles.label}>Quem pode acompanhar</Text>
          <View style={styles.segmentRow}>
            <Segment
              active={visibility === "PASTORAL"}
              label="Pastoral"
              onPress={() => setVisibility("PASTORAL")}
            />
            <Segment
              active={visibility === "PRAYER_TEAM"}
              label="Equipe de oração"
              onPress={() => setVisibility("PRAYER_TEAM")}
            />
          </View>

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <EloActionButton
            label="Enviar pedido"
            loading={saving}
            disabled={message.trim().length < 5}
            onPress={() => void submit()}
            icon="PaperPlaneTiltIcon"
          />
        </EloCard>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <EloState
          title="Nenhum pedido ainda"
          description="Quando você enviar um pedido de oração, o acompanhamento aparecerá aqui."
          icon="HandsPrayingIcon"
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <EloCard key={item.request_id}>
              <View style={styles.cardTopRow}>
                <StatusPill
                  label={prayerStatus[item.status] ?? item.status}
                  positive={item.status === "ANSWERED" || item.status === "CLOSED"}
                />
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>

              <Text style={styles.bodyText}>{item.message}</Text>

              {item.response_text ? (
                <View style={styles.responseBox}>
                  <Text style={styles.responseLabel}>Retorno da igreja</Text>
                  <Text style={styles.responseText}>{item.response_text}</Text>
                </View>
              ) : null}
            </EloCard>
          ))}
        </View>
      )}
    </EloScreen>
  );
}

function PastoralRequestsScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization } = useOrganization();

  const [items, setItems] = useState<PastoralRequest[]>([]);
  const [reason, setReason] = useState("");
  const [availability, setAvailability] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) return;

    setLoading(true);
    const { data, error } = await supabase.rpc("list_my_pastoral_requests", {
      p_organization_id: activeOrganization.id,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setItems((data ?? []) as PastoralRequest[]);
      setErrorMessage(null);
    }

    setLoading(false);
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit() {
    if (!activeOrganization || reason.trim().length < 5) return;

    setSaving(true);
    setErrorMessage(null);

    const { error } = await supabase.rpc("create_pastoral_request", {
      p_organization_id: activeOrganization.id,
      p_reason: reason.trim(),
      p_availability_notes: availability.trim() || null,
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      setReason("");
      setAvailability("");
      setShowForm(false);
      await load();
    }

    setSaving(false);
  }

  async function respond(requestId: string, accept: boolean) {
    setActionId(requestId);
    setErrorMessage(null);

    const { error } = await supabase.rpc("respond_pastoral_proposal", {
      p_request_id: requestId,
      p_accept: accept,
      p_note: accept ? null : "Solicito outra opção de horário.",
    });

    if (error) {
      setErrorMessage(error.message);
    } else {
      await load();
    }

    setActionId(null);
  }

  return (
    <EloScreen
      title="Atendimento pastoral"
      eyebrow="CUIDADO"
      subtitle="Solicite atendimento. Quando um horário for proposto, você decide se consegue comparecer."
      onBack={onBack}
      right={
        <Pressable onPress={() => setShowForm((current) => !current)} style={styles.iconButton}>
          <P.PlusIcon size={20} color={eloColors.ink} weight="bold" />
        </Pressable>
      }
    >
      {showForm ? (
        <EloCard style={styles.formCard}>
          <Text style={styles.formTitle}>Solicitar atendimento</Text>
          <Text style={styles.label}>Motivo</Text>
          <TextInput
            value={reason}
            onChangeText={setReason}
            placeholder="Conte brevemente como a liderança pode ajudar."
            multiline
            textAlignVertical="top"
            style={styles.textArea}
          />

          <Text style={styles.label}>Sua disponibilidade</Text>
          <TextInput
            value={availability}
            onChangeText={setAvailability}
            placeholder="Ex.: após as 18h durante a semana."
            multiline
            textAlignVertical="top"
            style={styles.smallArea}
          />

          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

          <EloActionButton
            label="Enviar solicitação"
            loading={saving}
            disabled={reason.trim().length < 5}
            onPress={() => void submit()}
            icon="PaperPlaneTiltIcon"
          />
        </EloCard>
      ) : null}

      {errorMessage && !showForm ? <Text style={styles.error}>{errorMessage}</Text> : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <EloState
          title="Nenhum atendimento solicitado"
          description="Use o botão + para pedir um atendimento pastoral."
          icon="ChatCenteredDotsIcon"
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <EloCard key={item.request_id}>
              <View style={styles.cardTopRow}>
                <StatusPill
                  label={pastoralStatus[item.status] ?? item.status}
                  positive={item.status === "CONFIRMED" || item.status === "COMPLETED"}
                />
                <Text style={styles.dateText}>{formatDate(item.created_at)}</Text>
              </View>

              <Text style={styles.bodyText}>{item.reason}</Text>

              {item.availability_notes ? (
                <Text style={styles.secondaryText}>
                  Disponibilidade informada: {item.availability_notes}
                </Text>
              ) : null}

              {item.proposed_start_at ? (
                <View style={styles.appointmentBox}>
                  <View style={styles.appointmentIcon}>
                    <P.CalendarCheckIcon
                      size={20}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  </View>
                  <View style={styles.flex}>
                    <Text style={styles.responseLabel}>Horário proposto</Text>
                    <Text style={styles.appointmentDate}>
                      {formatDateTime(item.proposed_start_at)}
                    </Text>
                    {item.proposal_note ? (
                      <Text style={styles.secondaryText}>{item.proposal_note}</Text>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {item.status === "PROPOSED" ? (
                <View style={styles.actionRow}>
                  <View style={styles.flex}>
                    <EloActionButton
                      label="Aceitar horário"
                      loading={actionId === item.request_id}
                      onPress={() => void respond(item.request_id, true)}
                      icon="CheckIcon"
                    />
                  </View>
                  <View style={styles.flex}>
                    <EloActionButton
                      label="Outro horário"
                      variant="secondary"
                      disabled={actionId === item.request_id}
                      onPress={() => void respond(item.request_id, false)}
                    />
                  </View>
                </View>
              ) : null}
            </EloCard>
          ))}
        </View>
      )}
    </EloScreen>
  );
}

function ContributionScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization } = useOrganization();

  const [info, setInfo] = useState<ContributionInfo>({});
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] =
    useState<"key" | "copyPaste" | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!activeOrganization) return;

      setLoading(true);

      const { data } = await supabase.rpc("get_member_contribution_info", {
        p_organization_id: activeOrganization.id,
      });

      if (mounted) {
        setInfo((data ?? {}) as ContributionInfo);
        setLoading(false);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [activeOrganization]);

  const pixValue = info.pix_copy_paste || info.pix_key || null;

  async function copyPix(
    value: string,
    field: "key" | "copyPaste"
  ) {
    await Clipboard.setStringAsync(value);
    setCopiedField(field);

    setTimeout(() => {
      setCopiedField((current) => (current === field ? null : current));
    }, 1800);
  }

  return (
    <EloScreen
      title="Contribuir"
      eyebrow="CONTRIBUIÇÃO"
      subtitle="O Elo apenas apresenta as informações oficiais da igreja. O pagamento é concluído no seu banco."
      onBack={onBack}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : !pixValue ? (
        <EloState
          title="Pix ainda não configurado"
          description="A administração da igreja ainda não publicou uma chave Pix para contribuições."
          icon="HeartIcon"
        />
      ) : (
        <>
          <EloCard>
            <View style={styles.contributionHeader}>
              <View style={styles.contributionIcon}>
                <P.HeartIcon size={24} color={eloColors.blue} weight="duotone" />
              </View>
              <View style={styles.flex}>
                <Text style={styles.formTitle}>
                  {info.beneficiary_name || activeOrganization?.name || "Sua igreja"}
                </Text>
                {info.bank_name ? (
                  <Text style={styles.secondaryText}>{info.bank_name}</Text>
                ) : null}
              </View>
            </View>

            {info.pix_key ? (
              <View style={styles.pixBlock}>
                <Text style={styles.responseLabel}>
                  Chave Pix{info.pix_key_type ? ` • ${info.pix_key_type}` : ""}
                </Text>
                <View style={styles.pixValueRow}>
                  <Text selectable style={styles.pixValue}>
                    {info.pix_key}
                  </Text>
                  <Pressable
                    accessibilityLabel="Copiar chave Pix"
                    onPress={() =>
                      void copyPix(info.pix_key!, "key")
                    }
                    style={({ pressed }) => [
                      styles.copyButton,
                      pressed && styles.pressed,
                    ]}
                  >
                    {copiedField === "key" ? (
                      <P.CheckIcon
                        size={16}
                        color={eloColors.green}
                        weight="bold"
                      />
                    ) : (
                      <P.CopySimpleIcon
                        size={16}
                        color={eloColors.blue}
                        weight="duotone"
                      />
                    )}
                    <Text
                      style={[
                        styles.copyButtonText,
                        copiedField === "key" &&
                          styles.copyButtonTextDone,
                      ]}
                    >
                      {copiedField === "key" ? "Copiado" : "Copiar"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ) : null}

            {info.pix_copy_paste ? (
              <View style={styles.pixBlock}>
                <Text style={styles.responseLabel}>Pix copia e cola</Text>
                <Text selectable style={styles.pixCopy}>
                  {info.pix_copy_paste}
                </Text>
                <Pressable
                  accessibilityLabel="Copiar código Pix copia e cola"
                  onPress={() =>
                    void copyPix(
                      info.pix_copy_paste!,
                      "copyPaste"
                    )
                  }
                  style={({ pressed }) => [
                    styles.copyWideButton,
                    pressed && styles.pressed,
                  ]}
                >
                  {copiedField === "copyPaste" ? (
                    <P.CheckIcon
                      size={16}
                      color={eloColors.green}
                      weight="bold"
                    />
                  ) : (
                    <P.CopySimpleIcon
                      size={16}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  )}
                  <Text
                    style={[
                      styles.copyButtonText,
                      copiedField === "copyPaste" &&
                        styles.copyButtonTextDone,
                    ]}
                  >
                    {copiedField === "copyPaste"
                      ? "Código copiado"
                      : "Copiar código"}
                  </Text>
                </Pressable>
                <Text style={styles.copyHint}>
                  Depois, cole o código no aplicativo do seu banco.
                </Text>
              </View>
            ) : null}

            {info.instructions ? (
              <Text style={styles.instructions}>{info.instructions}</Text>
            ) : null}
          </EloCard>

          <View style={styles.infoNotice}>
            <P.ShieldCheckIcon size={20} color={eloColors.green} weight="duotone" />
            <Text style={styles.infoNoticeText}>
              O Elo não recebe nem confirma o pagamento. Confira o favorecido no seu banco antes de concluir.
            </Text>
          </View>
        </>
      )}
    </EloScreen>
  );
}

function Segment({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.segment,
        active && styles.segmentActive,
      ]}
    >
      <Text
        style={[
          styles.segmentText,
          active && styles.segmentTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function StatusPill({
  label,
  positive,
}: {
  label: string;
  positive?: boolean;
}) {
  return (
    <View style={[styles.statusPill, positive && styles.statusPillPositive]}>
      <Text style={[styles.statusText, positive && styles.statusTextPositive]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  loading: {
    paddingVertical: 60,
    alignItems: "center",
  },
  list: {
    gap: 10,
  },
  pressed: {
    opacity: 0.76,
  },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
  },
  attentionCard: {
    marginBottom: 12,
    minHeight: 92,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BDDCEF",
    borderRadius: 18,
    backgroundColor: "#F2F9FD",
  },
  attentionIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#E4F2FB",
  },
  attentionKicker: {
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.8,
    color: eloColors.blue,
  },
  attentionTitle: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  attentionMeta: {
    marginTop: 4,
    fontSize: 11,
    color: eloColors.muted,
  },
  formCard: {
    marginBottom: 12,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: eloColors.ink,
  },
  label: {
    marginTop: 15,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  textArea: {
    minHeight: 120,
    padding: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
    color: eloColors.ink,
  },
  smallArea: {
    minHeight: 84,
    padding: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    lineHeight: 20,
    color: eloColors.ink,
  },
  segmentRow: {
    marginBottom: 14,
    flexDirection: "row",
    gap: 8,
  },
  segment: {
    flex: 1,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  segmentActive: {
    borderColor: eloColors.blue,
    backgroundColor: eloColors.surfaceSoft,
  },
  segmentText: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  segmentTextActive: {
    color: eloColors.blue,
  },
  error: {
    marginVertical: 10,
    fontSize: 12,
    lineHeight: 17,
    color: eloColors.danger,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: eloColors.surfaceSoft,
  },
  statusPillPositive: {
    backgroundColor: eloColors.successSoft,
  },
  statusText: {
    fontSize: 9,
    fontWeight: "900",
    color: eloColors.blue,
  },
  statusTextPositive: {
    color: eloColors.green,
  },
  dateText: {
    fontSize: 10,
    color: eloColors.muted,
  },
  bodyText: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 20,
    color: eloColors.ink,
  },
  secondaryText: {
    marginTop: 6,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  responseBox: {
    marginTop: 12,
    padding: 12,
    borderRadius: 14,
    backgroundColor: eloColors.successSoft,
  },
  responseLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
    color: eloColors.muted,
  },
  responseText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.ink,
  },
  appointmentBox: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  appointmentIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  appointmentDate: {
    marginTop: 4,
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  actionRow: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  contributionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  contributionIcon: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: eloColors.surfaceSoft,
  },
  pixBlock: {
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
  },
  pixValueRow: {
    marginTop: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  copyButton: {
    minHeight: 38,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#BBDCEC",
    borderRadius: 12,
    backgroundColor: "#F2F9FD",
  },
  copyWideButton: {
    alignSelf: "flex-start",
    minHeight: 40,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: "#BBDCEC",
    borderRadius: 12,
    backgroundColor: "#F2F9FD",
  },
  copyButtonText: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.blue,
  },
  copyButtonTextDone: {
    color: eloColors.green,
  },
  pixValue: {
    flex: 1,
    fontSize: 17,
    lineHeight: 23,
    fontWeight: "900",
    color: eloColors.ink,
  },
  pixCopy: {
    marginTop: 7,
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.ink,
  },
  copyHint: {
    marginTop: 7,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  instructions: {
    marginTop: 16,
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.muted,
  },
  infoNotice: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: "#DCE9DF",
    borderRadius: 16,
    backgroundColor: "#F6FBF7",
  },
  infoNoticeText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: eloColors.muted,
  },
});
