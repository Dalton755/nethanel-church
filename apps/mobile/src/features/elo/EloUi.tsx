import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import QRCode from "react-native-qrcode-svg";
import * as Phosphor from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const P = Phosphor as any;

export const eloColors = {
  background: "#F6F8FB",
  surface: "#FFFFFF",
  surfaceSoft: "#EEF5FA",
  ink: "#15191D",
  muted: "#69737D",
  line: "#DEE5EB",
  blue: "#2387C9",
  green: "#57A966",
  yellow: "#E5A62D",
  danger: "#B74646",
  successSoft: "#EDF8F0",
  dangerSoft: "#FFF0F0",
};

export function EloScreen({
  title,
  eyebrow,
  subtitle,
  onBack,
  right,
  children,
}: {
  title: string;
  eyebrow?: string;
  subtitle?: string;
  onBack?: () => void;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.screenContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topRow}>
          {onBack ? (
            <Pressable onPress={onBack} style={styles.iconButton}>
              <P.ArrowLeftIcon size={20} color={eloColors.ink} weight="bold" />
            </Pressable>
          ) : (
            <View style={styles.brandMark}>
              <Text style={styles.brandMarkText}>E</Text>
            </View>
          )}

          <View style={styles.headingCopy}>
            {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
            <Text style={styles.title}>{title}</Text>
          </View>

          {right ?? <View style={styles.iconButtonPlaceholder} />}
        </View>

        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function EloCard({
  children,
  pressed,
}: {
  children: ReactNode;
  pressed?: boolean;
}) {
  return (
    <View style={[styles.card, pressed && styles.cardPressed]}>
      {children}
    </View>
  );
}

export function EloModuleCard({
  icon,
  title,
  description,
  badge,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  badge?: string;
  onPress: () => void;
}) {
  const Icon = P[icon] ?? P.SquaresFourIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.moduleCard,
        pressed && styles.cardPressed,
      ]}
    >
      <View style={styles.moduleIcon}>
        <Icon size={23} color={eloColors.blue} weight="duotone" />
      </View>

      <View style={styles.moduleCopy}>
        <View style={styles.moduleTitleRow}>
          <Text style={styles.moduleTitle}>{title}</Text>
          {badge ? <Text style={styles.badge}>{badge}</Text> : null}
        </View>

        <Text style={styles.moduleDescription}>{description}</Text>
      </View>

      <P.CaretRightIcon size={18} color="#9AA4AE" weight="bold" />
    </Pressable>
  );
}

export function EloActionButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  icon,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  loading?: boolean;
  icon?: string;
}) {
  const Icon = icon ? P[icon] : null;

  return (
    <Pressable
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionButton,
        variant === "secondary" && styles.actionButtonSecondary,
        variant === "danger" && styles.actionButtonDanger,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading && styles.cardPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === "secondary" ? eloColors.ink : "#fff"} />
      ) : (
        <>
          {Icon ? (
            <Icon
              size={18}
              color={variant === "secondary" ? eloColors.ink : "#fff"}
              weight="bold"
            />
          ) : null}
          <Text
            style={[
              styles.actionButtonText,
              variant === "secondary" && styles.actionButtonTextSecondary,
            ]}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function EloState({
  title,
  description,
  icon = "InfoIcon",
}: {
  title: string;
  description: string;
  icon?: string;
}) {
  const Icon = P[icon] ?? P.InfoIcon;

  return (
    <View style={styles.state}>
      <View style={styles.stateIcon}>
        <Icon size={23} color={eloColors.muted} weight="duotone" />
      </View>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateDescription}>{description}</Text>
    </View>
  );
}

export function EloQrModal({
  visible,
  title,
  subtitle,
  token,
  expiresAt,
  onClose,
}: {
  visible: boolean;
  title: string;
  subtitle?: string;
  token: string | null;
  expiresAt?: string | null;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.qrSheet}>
          <View style={styles.qrHeader}>
            <View style={styles.qrIcon}>
              <P.QrCodeIcon size={22} color={eloColors.blue} weight="duotone" />
            </View>
            <Pressable onPress={onClose} style={styles.iconButton}>
              <P.XIcon size={19} color={eloColors.ink} weight="bold" />
            </Pressable>
          </View>

          <Text style={styles.qrTitle}>{title}</Text>
          {subtitle ? <Text style={styles.qrSubtitle}>{subtitle}</Text> : null}

          {token ? (
            <View style={styles.qrBox}>
              <QRCode value={token} size={220} backgroundColor="#FFFFFF" color="#15191D" />
            </View>
          ) : null}

          {expiresAt ? (
            <Text style={styles.qrExpiry}>
              Válido até {new Intl.DateTimeFormat("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }).format(new Date(expiresAt))}
            </Text>
          ) : null}

          <EloActionButton label="Fechar" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export const eloSharedStyles = StyleSheet.create({
  sectionTitle: {
    marginTop: 26,
    marginBottom: 10,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: eloColors.ink,
  },
  cardText: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.muted,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
  },
  gap8: {
    gap: 8,
  },
  gap10: {
    gap: 10,
  },
});

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: eloColors.background,
  },
  screenContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headingCopy: {
    flex: 1,
  },
  brandMark: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: eloColors.surfaceSoft,
  },
  brandMarkText: {
    fontSize: 20,
    fontWeight: "900",
    color: eloColors.blue,
  },
  eyebrow: {
    marginBottom: 2,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
    color: eloColors.muted,
  },
  title: {
    fontSize: 27,
    lineHeight: 32,
    fontWeight: "900",
    color: eloColors.ink,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 14,
    lineHeight: 21,
    color: eloColors.muted,
  },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 14,
    backgroundColor: eloColors.surface,
  },
  iconButtonPlaceholder: {
    width: 42,
    height: 42,
  },
  card: {
    padding: 16,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: eloColors.surface,
  },
  cardPressed: {
    opacity: 0.76,
  },
  moduleCard: {
    minHeight: 86,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    marginBottom: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: eloColors.surface,
  },
  moduleIcon: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  moduleCopy: {
    flex: 1,
  },
  moduleTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  moduleTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: eloColors.ink,
  },
  moduleDescription: {
    marginTop: 4,
    fontSize: 12,
    lineHeight: 17,
    color: eloColors.muted,
  },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: eloColors.surfaceSoft,
    fontSize: 9,
    fontWeight: "800",
    color: eloColors.blue,
  },
  actionButton: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 15,
    borderRadius: 14,
    backgroundColor: eloColors.ink,
  },
  actionButtonSecondary: {
    borderWidth: 1,
    borderColor: eloColors.line,
    backgroundColor: eloColors.surface,
  },
  actionButtonDanger: {
    backgroundColor: eloColors.danger,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#FFFFFF",
  },
  actionButtonTextSecondary: {
    color: eloColors.ink,
  },
  disabled: {
    opacity: 0.45,
  },
  state: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 34,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: eloColors.surface,
  },
  stateIcon: {
    width: 45,
    height: 45,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
    backgroundColor: eloColors.surfaceSoft,
  },
  stateTitle: {
    marginTop: 12,
    fontSize: 15,
    fontWeight: "800",
    color: eloColors.ink,
  },
  stateDescription: {
    marginTop: 5,
    maxWidth: 320,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: eloColors.muted,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(16,21,26,0.45)",
  },
  qrSheet: {
    padding: 20,
    borderRadius: 24,
    backgroundColor: eloColors.surface,
  },
  qrHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  qrIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: eloColors.surfaceSoft,
  },
  qrTitle: {
    marginTop: 16,
    fontSize: 22,
    fontWeight: "900",
    color: eloColors.ink,
  },
  qrSubtitle: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 19,
    color: eloColors.muted,
  },
  qrBox: {
    alignItems: "center",
    marginVertical: 24,
    padding: 16,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
  },
  qrExpiry: {
    marginBottom: 14,
    textAlign: "center",
    fontSize: 11,
    color: eloColors.muted,
  },
});
