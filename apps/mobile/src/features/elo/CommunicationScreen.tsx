import { useCallback, useEffect, useState } from "react";
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

type Message = {
  id: string;
  title: string;
  body: string;
  segment_type: string;
  recipient_count: number;
  created_at: string;
};

export function CommunicationScreen({ onBack }: { onBack: () => void }) {
  const { activeOrganization, canAtOrganization } = useOrganization();
  const canSend = canAtOrganization("communication.send");

  const [items, setItems] = useState<Message[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [showComposer, setShowComposer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase
        .from("communication_messages")
        .select("id,title,body,segment_type,recipient_count,created_at")
        .eq("organization_id", activeOrganization.id)
        .order("created_at", { ascending: false })
        .limit(30);

      if (error) throw error;
      setItems((data ?? []) as Message[]);
    } catch (error) {
      setItems([]);
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível carregar o histórico."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!activeOrganization) return;

    if (title.trim().length < 2 || body.trim().length < 2) {
      Alert.alert("Mensagem incompleta", "Preencha título e mensagem.");
      return;
    }

    setSending(true);

    try {
      const { error } = await supabase.rpc("send_communication", {
        p_organization_id: activeOrganization.id,
        p_title: title.trim(),
        p_body: body.trim(),
        p_segment_type: "ORGANIZATION",
        p_segment_value: null,
        p_data: {},
      });

      if (error) throw error;

      setTitle("");
      setBody("");
      setShowComposer(false);
      await load();

      Alert.alert("Enviado", "A comunicação entrou na central de notificações.");
    } catch (error) {
      Alert.alert(
        "Não foi possível enviar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <EloScreen
      title="Comunicação"
      eyebrow="ELO • CONECTAR"
      subtitle="Avisos e mensagens importantes sem depender de grupos paralelos."
      onBack={onBack}
    >
      {canSend ? (
        <View style={styles.topAction}>
          <EloActionButton
            label={showComposer ? "Fechar mensagem" : "Nova comunicação"}
            variant={showComposer ? "secondary" : "primary"}
            icon={showComposer ? "XIcon" : "MegaphoneIcon"}
            onPress={() => setShowComposer((value) => !value)}
          />
        </View>
      ) : null}

      {showComposer ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>Enviar para toda a igreja</Text>

          <Text style={styles.label}>Título</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Ex.: Ensaio do louvor"
            style={styles.input}
          />

          <Text style={styles.label}>Mensagem</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            placeholder="Escreva a mensagem"
            multiline
            style={[styles.input, styles.textarea]}
          />

          <EloActionButton
            label="Enviar comunicação"
            icon="PaperPlaneTiltIcon"
            loading={sending}
            onPress={() => void send()}
          />
        </EloCard>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Histórico</Text>

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : items.length === 0 ? (
        <EloState
          title="Nenhuma comunicação enviada"
          description={
            errorMessage ||
            "As comunicações da liderança aparecerão aqui e na Central de Notificações."
          }
          icon="MegaphoneIcon"
        />
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <EloCard key={item.id}>
              <View style={styles.header}>
                <View style={styles.iconWrap}>
                  <P.MegaphoneIcon
                    size={22}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <View style={styles.headerCopy}>
                  <Text style={eloSharedStyles.cardTitle}>{item.title}</Text>
                  <Text style={styles.meta}>
                    {new Intl.DateTimeFormat("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    }).format(new Date(item.created_at))}
                    {item.recipient_count > 0
                      ? ` • ${item.recipient_count} destinatários`
                      : ""}
                  </Text>
                </View>
              </View>

              <Text style={eloSharedStyles.cardText}>{item.body}</Text>
            </EloCard>
          ))}
        </View>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  topAction: {
    marginTop: 20,
    marginBottom: 10,
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.muted,
  },
  input: {
    minHeight: 50,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: eloColors.ink,
  },
  textarea: {
    minHeight: 110,
    marginBottom: 14,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  list: {
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
    backgroundColor: eloColors.surfaceSoft,
  },
  headerCopy: {
    flex: 1,
  },
  meta: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
});
