import {
  Image,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import {
  EloActionButton,
  EloCard,
  EloScreen,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";
import type { ServiceEditorData } from "./NewServiceScreen";

const P = Phosphor as any;

type Props = {
  service: ServiceEditorData;
  canManage: boolean;
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

function formatDate(value: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(new Date(value));

  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function ServiceDetailsScreen({
  service,
  canManage,
  onBack,
  onEdit,
  onDelete,
}: Props) {
  return (
    <EloScreen
      title={service.title}
      eyebrow={
        service.recurring
          ? "ELO • CULTO RECORRENTE"
          : "ELO • CULTO"
      }
      subtitle={formatDate(service.starts_at)}
      onBack={onBack}
    >
      {service.cover_image_url ? (
        <Image
          source={{ uri: service.cover_image_url }}
          style={styles.cover}
        />
      ) : null}

      {service.recurring ? (
        <View style={styles.recurringNotice}>
          <P.ArrowsClockwiseIcon
            size={21}
            color={eloColors.blue}
            weight="duotone"
          />
          <View style={styles.noticeCopy}>
            <Text style={styles.noticeTitle}>
              Faz parte de uma rotina semanal
            </Text>
            <Text style={styles.noticeText}>
              Alterações nesta ocorrência são tratadas como exceção,
              sem interromper os próximos cultos da rotina.
            </Text>
          </View>
        </View>
      ) : null}

      <Text style={eloSharedStyles.sectionTitle}>Quando e onde</Text>

      <EloCard>
        <InfoRow
          icon="ClockIcon"
          label="Horário"
          value={
            service.ends_at
              ? formatTime(service.starts_at) +
                " – " +
                formatTime(service.ends_at)
              : formatTime(service.starts_at)
          }
        />

        <View style={styles.separator} />

        <InfoRow
          icon="MapPinIcon"
          label="Local"
          value={service.location_name || "Não informado"}
        />
      </EloCard>

      <Text style={eloSharedStyles.sectionTitle}>Mensagem</Text>

      <EloCard>
        <Detail
          label="Tema"
          value={service.theme}
          empty="Tema ainda não informado"
        />
        <View style={styles.separator} />
        <Detail
          label="Pregador"
          value={service.preacher_name}
          empty="Pregador ainda não informado"
        />
        <View style={styles.separator} />
        <Detail
          label="Referência bíblica"
          value={service.bible_reference}
          empty="Referência ainda não informada"
        />
      </EloCard>

      {canManage ? (
        <View style={styles.actions}>
          {!service.recurring ? (
            <EloActionButton
              label="Editar culto"
              icon="PencilSimpleIcon"
              onPress={onEdit}
            />
          ) : null}

          <EloActionButton
            label={
              service.recurring
                ? "Cancelar esta ocorrência"
                : "Excluir culto"
            }
            icon="TrashIcon"
            variant="danger"
            onPress={onDelete}
          />
        </View>
      ) : null}
    </EloScreen>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: string;
}) {
  const Icon = P[icon] ?? P.InfoIcon;

  return (
    <View style={styles.infoRow}>
      <View style={styles.infoIcon}>
        <Icon
          size={20}
          color={eloColors.blue}
          weight="duotone"
        />
      </View>

      <View style={styles.infoCopy}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

function Detail({
  label,
  value,
  empty,
}: {
  label: string;
  value: string | null;
  empty: string;
}) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text
        style={[
          styles.detailValue,
          !value && styles.detailEmpty,
        ]}
      >
        {value || empty}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    width: "100%",
    aspectRatio: 16 / 9,
    marginTop: 22,
    borderRadius: 20,
    resizeMode: "cover",
    backgroundColor: eloColors.surfaceSoft,
  },
  recurringNotice: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EAF5FB",
  },
  noticeCopy: {
    flex: 1,
  },
  noticeTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: eloColors.blue,
  },
  noticeText: {
    marginTop: 3,
    fontSize: 11,
    lineHeight: 17,
    color: "#557084",
  },
  separator: {
    height: 1,
    marginLeft: 50,
    backgroundColor: eloColors.line,
  },
  infoRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  infoIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: eloColors.surfaceSoft,
  },
  infoCopy: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  infoValue: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.ink,
  },
  detail: {
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  detailValue: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 21,
    color: eloColors.ink,
  },
  detailEmpty: {
    color: "#9AA4AE",
    fontStyle: "italic",
  },
  actions: {
    marginTop: 24,
    gap: 9,
  },
});
