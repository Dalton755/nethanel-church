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
  canSchedule: boolean;
  onBack: () => void;
  onEdit: () => void;
  onEditDetails: () => void;
  onOpenSchedule: () => void;
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
  canSchedule,
  onBack,
  onEdit,
  onEditDetails,
  onOpenSchedule,
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
      ) : canManage ? (
        <View style={styles.noCover}>
          <P.ImageIcon
            size={24}
            color={eloColors.muted}
            weight="duotone"
          />
          <Text style={styles.noCoverText}>
            Este culto ainda não tem foto de capa.
          </Text>
        </View>
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
              Foto, pregador, tema e referência podem ser personalizados
              nesta ocorrência sem alterar os próximos cultos.
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

      {canSchedule ? (
        <View style={styles.scheduleAction}>
          <EloActionButton
            label="Escala deste culto"
            icon="CalendarCheckIcon"
            onPress={onOpenSchedule}
          />
          <Text style={styles.scheduleHint}>
            A escala vale somente para esta data, mesmo quando o culto é recorrente.
          </Text>
        </View>
      ) : null}

      {canManage ? (
        <View style={styles.actions}>
          <EloActionButton
            label="Foto, pregador e referência"
            icon="ImageIcon"
            onPress={onEditDetails}
          />

          {!service.recurring ? (
            <EloActionButton
              label="Editar data e culto"
              icon="PencilSimpleIcon"
              variant="secondary"
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
  noCover: {
    minHeight: 84,
    marginTop: 22,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    padding: 14,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  noCoverText: {
    fontSize: 12,
    color: eloColors.muted,
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
  scheduleAction: {
    marginTop: 24,
  },
  scheduleHint: {
    marginTop: 7,
    paddingHorizontal: 4,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  actions: {
    marginTop: 12,
    gap: 9,
  },
});
