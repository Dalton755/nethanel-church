import { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

export function AccountPrivacyScreen({ onBack }: { onBack: () => void }) {
  const [reason, setReason] = useState("");
  const [requestingDeletion, setRequestingDeletion] = useState(false);

  async function requestDeletion() {
    setRequestingDeletion(true);

    const { error } = await supabase.rpc("request_my_account_deletion", {
      p_reason: reason.trim() || null,
    });

    setRequestingDeletion(false);

    if (error) {
      Alert.alert(
        "Não foi possível registrar o pedido",
        error.message
      );
      return;
    }

    Alert.alert(
      "Pedido registrado",
      "Recebemos sua solicitação de exclusão. O pedido será verificado antes da remoção da conta e dos dados associados, respeitando eventuais obrigações legais de retenção."
    );

    setReason("");
  }

  function confirmDeletion() {
    Alert.alert(
      "Solicitar exclusão da conta?",
      "Esse pedido inicia o processo de exclusão da sua conta e dos dados pessoais associados ao Elo. Dados que precisem ser mantidos por obrigação legal poderão ser retidos pelo prazo necessário.",
      [
        {
          text: "Cancelar",
          style: "cancel",
        },
        {
          text: "Solicitar exclusão",
          style: "destructive",
          onPress: () => {
            void requestDeletion();
          },
        },
      ]
    );
  }

  return (
    <EloScreen
      title="Privacidade e conta"
      eyebrow="SEUS DADOS"
      subtitle="Veja como o Elo usa seus dados e controle sua conta."
      onBack={onBack}
    >
      <Text style={eloSharedStyles.sectionTitle}>Política de privacidade</Text>

      <EloCard>
        <Text style={styles.title}>Como tratamos seus dados</Text>
        <Text style={styles.copy}>
          O Nethanel Elo usa os dados necessários para autenticação, vínculo com a igreja,
          agenda, escalas, comunicação, cuidado pastoral, Elo Kids e demais recursos que
          você ou sua igreja utilizarem.
        </Text>

        <Text style={styles.subtitle}>Dados que podem ser tratados</Text>
        <Text style={styles.copy}>
          Nome, e-mail, telefone, data de nascimento, vínculo e função na igreja,
          informações de agenda e escalas, solicitações feitas no app, dados de crianças
          cadastrados por responsáveis, identificadores de dispositivo para notificações
          e dados necessários à segurança da conta.
        </Text>

        <Text style={styles.subtitle}>Proteção e compartilhamento</Text>
        <Text style={styles.copy}>
          Os dados são transmitidos por conexões protegidas e podem ser processados por
          fornecedores de infraestrutura, autenticação e notificações necessários ao
          funcionamento do Elo. O Nethanel Elo não vende dados pessoais.
        </Text>

        <Text style={styles.subtitle}>Crianças</Text>
        <Text style={styles.copy}>
          No Elo Kids, os dados de crianças são cadastrados e administrados por seus
          responsáveis e pela equipe autorizada da igreja. A criança não precisa criar uma
          conta própria para usar esse fluxo.
        </Text>

        <Text style={styles.subtitle}>Seus direitos</Text>
        <Text style={styles.copy}>
          Você pode pedir acesso, correção ou exclusão de dados pessoais. A exclusão da
          conta pode ser solicitada abaixo. Alguns registros podem ser preservados quando
          houver obrigação legal ou necessidade legítima de segurança e auditoria.
        </Text>

        <Text style={styles.updated}>Atualizada em 28/09/2026.</Text>
      </EloCard>

      <Text style={eloSharedStyles.sectionTitle}>Excluir minha conta</Text>

      <EloCard>
        <Text style={styles.title}>Solicitação de exclusão</Text>
        <Text style={styles.copy}>
          Ao solicitar, registramos o pedido vinculado à sua conta. A remoção é processada
          após verificação para evitar exclusões indevidas.
        </Text>

        <Text style={styles.fieldLabel}>Motivo (opcional)</Text>
        <TextInput
          value={reason}
          onChangeText={setReason}
          multiline
          maxLength={1000}
          placeholder="Conte o motivo se quiser."
          placeholderTextColor="#9AA4AE"
          style={styles.textArea}
          textAlignVertical="top"
        />

        <View style={styles.button}>
          <EloActionButton
            label="Solicitar exclusão da conta"
            variant="danger"
            icon="TrashIcon"
            loading={requestingDeletion}
            onPress={confirmDeletion}
          />
        </View>
      </EloCard>
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 16,
    fontWeight: "900",
    color: eloColors.ink,
  },
  subtitle: {
    marginTop: 18,
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.ink,
  },
  copy: {
    marginTop: 6,
    fontSize: 12,
    lineHeight: 19,
    color: eloColors.muted,
  },
  updated: {
    marginTop: 18,
    fontSize: 10,
    fontWeight: "700",
    color: eloColors.muted,
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 7,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  textArea: {
    minHeight: 100,
    paddingHorizontal: 13,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: "#FAFBFC",
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.ink,
  },
  button: {
    marginTop: 14,
  },
});
