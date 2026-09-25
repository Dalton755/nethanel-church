import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloQrModal,
  EloScreen,
  EloState,
  eloColors,
  eloSharedStyles,
} from "./EloUi";

const P = Phosphor as any;

type EventItem = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  status: string;
};

type RegistrationSetting = {
  event_id: string;
  enabled: boolean;
  capacity: number;
  waitlist_enabled: boolean;
  qr_checkin_enabled: boolean;
  max_party_size: number;
};

type MyRegistration = {
  registration_id: string;
  event_id: string;
  event_title: string;
  starts_at: string;
  ends_at: string | null;
  location_name: string | null;
  party_size: number;
  status: string;
  qr_checkin_enabled: boolean;
  can_open_qr: boolean;
};

type QrPayload = {
  token?: string;
  expires_at?: string;
  event_title?: string;
  owner_name?: string;
  party_size?: number;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function EventsScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization, activeUnit } = useOrganization();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [settings, setSettings] = useState<Record<string, RegistrationSetting>>({});
  const [registrations, setRegistrations] = useState<Record<string, MyRegistration>>({});
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [qr, setQr] = useState<QrPayload | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const [eventsResponse, settingsResponse, myResponse] = await Promise.all([
        supabase
          .from("events")
          .select("id,title,description,starts_at,ends_at,location_name,status")
          .eq("organization_id", activeOrganization.id)
          .eq("unit_id", activeUnit.id)
          .eq("status", "published")
          .gte("starts_at", new Date().toISOString())
          .order("starts_at", { ascending: true })
          .limit(30),

        supabase
          .from("event_registration_settings")
          .select("event_id,enabled,capacity,waitlist_enabled,qr_checkin_enabled,max_party_size")
          .eq("organization_id", activeOrganization.id)
          .eq("enabled", true),

        supabase.rpc("list_my_event_registrations", {
          p_organization_id: activeOrganization.id,
        }),
      ]);

      if (eventsResponse.error) throw eventsResponse.error;
      if (settingsResponse.error) throw settingsResponse.error;
      if (myResponse.error) throw myResponse.error;

      setEvents((eventsResponse.data ?? []) as EventItem[]);

      const nextSettings: Record<string, RegistrationSetting> = {};
      ((settingsResponse.data ?? []) as RegistrationSetting[]).forEach((item) => {
        nextSettings[item.event_id] = item;
      });
      setSettings(nextSettings);

      const nextRegistrations: Record<string, MyRegistration> = {};
      ((myResponse.data ?? []) as MyRegistration[]).forEach((item) => {
        nextRegistrations[item.event_id] = item;
      });
      setRegistrations(nextRegistrations);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível carregar os eventos."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit]);

  useEffect(() => {
    void load();
  }, [load]);

  const registrationCount = useMemo(
    () => Object.keys(registrations).length,
    [registrations]
  );

  async function register(event: EventItem) {
    setWorkingId(event.id);

    try {
      const { error } = await supabase.rpc("register_my_event", {
        p_event_id: event.id,
        p_guest_names: [],
      });

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Inscrição não concluída",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function cancel(registration: MyRegistration) {
    setWorkingId(registration.event_id);

    try {
      const { error } = await supabase.rpc("cancel_my_event_registration", {
        p_registration_id: registration.registration_id,
      });

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível cancelar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setWorkingId(null);
    }
  }

  async function openQr(registration: MyRegistration) {
    setWorkingId(registration.event_id);

    try {
      const { data, error } = await supabase.rpc("issue_my_event_qr", {
        p_registration_id: registration.registration_id,
      });

      if (error) throw error;
      setQr((data ?? null) as QrPayload | null);
    } catch (error) {
      Alert.alert(
        "QR indisponível",
        error instanceof Error
          ? error.message
          : "O QR fica disponível próximo ao horário do evento."
      );
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <EloScreen
        title="Eventos"
        eyebrow="ELO • PARTICIPAR"
        subtitle={
          registrationCount > 0
            ? `Você tem ${registrationCount} inscrição${registrationCount > 1 ? "ões" : ""} ativa${registrationCount > 1 ? "s" : ""}.`
            : "Veja o que vem pela frente e faça sua inscrição sem sair do Elo."
        }
        onBack={onBack}
      >
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : errorMessage ? (
          <EloState
            title="Não conseguimos carregar os eventos"
            description={errorMessage}
            icon="WarningCircleIcon"
          />
        ) : events.length === 0 ? (
          <EloState
            title="Nenhum evento publicado"
            description="Quando a igreja publicar um evento futuro, ele aparecerá aqui."
            icon="TicketIcon"
          />
        ) : (
          <View style={styles.list}>
            {events.map((event) => {
              const setting = settings[event.id];
              const registration = registrations[event.id];
              const busy = workingId === event.id;

              return (
                <EloCard key={event.id}>
                  <View style={styles.header}>
                    <View style={styles.iconWrap}>
                      <P.TicketIcon
                        size={22}
                        color={eloColors.yellow}
                        weight="duotone"
                      />
                    </View>
                    <View style={styles.headerCopy}>
                      <Text style={eloSharedStyles.cardTitle}>{event.title}</Text>
                      <Text style={styles.date}>{formatDate(event.starts_at)}</Text>
                    </View>
                  </View>

                  {event.description ? (
                    <Text style={eloSharedStyles.cardText} numberOfLines={3}>
                      {event.description}
                    </Text>
                  ) : null}

                  {event.location_name ? (
                    <View style={styles.metaRow}>
                      <P.MapPinIcon size={16} color={eloColors.muted} />
                      <Text style={styles.meta}>{event.location_name}</Text>
                    </View>
                  ) : null}

                  {registration ? (
                    <View style={styles.registration}>
                      <View style={styles.registrationStatus}>
                        <P.CheckCircleIcon
                          size={17}
                          color={eloColors.green}
                          weight="fill"
                        />
                        <Text style={styles.registrationText}>
                          {registration.status === "WAITLIST"
                            ? "Lista de espera"
                            : "Inscrição confirmada"}
                        </Text>
                      </View>

                      <View style={styles.actions}>
                        {registration.qr_checkin_enabled ? (
                          <View style={styles.flexButton}>
                            <EloActionButton
                              label="Meu QR"
                              icon="QrCodeIcon"
                              loading={busy}
                              onPress={() => void openQr(registration)}
                            />
                          </View>
                        ) : null}

                        <View style={styles.flexButton}>
                          <EloActionButton
                            label="Cancelar"
                            variant="secondary"
                            disabled={busy}
                            onPress={() => void cancel(registration)}
                          />
                        </View>
                      </View>
                    </View>
                  ) : setting ? (
                    <View style={styles.actions}>
                      <View style={styles.flexButton}>
                        <EloActionButton
                          label="Quero participar"
                          icon="CheckIcon"
                          loading={busy}
                          onPress={() => void register(event)}
                        />
                      </View>
                    </View>
                  ) : (
                    <Text style={styles.openEvent}>
                      Evento aberto • sem inscrição obrigatória
                    </Text>
                  )}
                </EloCard>
              );
            })}
          </View>
        )}
      </EloScreen>

      <EloQrModal
        visible={Boolean(qr?.token)}
        title={qr?.event_title ?? "QR do evento"}
        subtitle={
          qr?.party_size
            ? `${qr.party_size} pessoa${qr.party_size > 1 ? "s" : ""} nesta inscrição`
            : "Apresente este QR no check-in."
        }
        token={qr?.token ?? null}
        expiresAt={qr?.expires_at ?? null}
        onClose={() => setQr(null)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  list: {
    marginTop: 22,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  iconWrap: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: "#FFF7E5",
  },
  headerCopy: {
    flex: 1,
  },
  date: {
    marginTop: 3,
    fontSize: 12,
    color: eloColors.muted,
  },
  metaRow: {
    marginTop: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  meta: {
    flex: 1,
    fontSize: 12,
    color: eloColors.muted,
  },
  registration: {
    marginTop: 14,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: eloColors.line,
  },
  registrationStatus: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  registrationText: {
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.green,
  },
  actions: {
    marginTop: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  flexButton: {
    flexGrow: 1,
    flexBasis: 140,
  },
  openEvent: {
    marginTop: 14,
    fontSize: 12,
    fontWeight: "700",
    color: eloColors.muted,
  },
});
