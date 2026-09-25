import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import * as Phosphor from "phosphor-react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EloLogo } from "../../branding/EloBrand";
import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import type { MainTabParamList } from "../../navigation/MainTabs";
import { eloColors } from "../elo/EloUi";

const P = Phosphor as any;

type OrganizationExtra = {
  join_code: string | null;
};

type Subscription = {
  plan_code: string;
  status: string;
  current_period_end: string | null;
};

export function MoreScreen() {
  const {
    profile,
    organizations,
    activeOrganization,
    activeUnit,
    canAtOrganization,
    clearOrganizationSelection,
  } = useOrganization();

  const navigation =
    useNavigation<BottomTabNavigationProp<MainTabParamList>>();

  const [extra, setExtra] = useState<OrganizationExtra | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);

  const canManage =
    canAtOrganization("security.manage") ||
    canAtOrganization("organization.manage") ||
    canAtOrganization("units.manage") ||
    canAtOrganization("audit.view");

  const load = useCallback(async () => {
    if (!activeOrganization) {
      setLoading(false);
      return;
    }

    setLoading(true);

    const [orgResponse, planResponse] = await Promise.all([
      supabase
        .from("organizations")
        .select("join_code")
        .eq("id", activeOrganization.id)
        .maybeSingle(),

      supabase
        .from("organization_subscriptions")
        .select("plan_code,status,current_period_end")
        .eq("organization_id", activeOrganization.id)
        .maybeSingle(),
    ]);

    if (!orgResponse.error) {
      setExtra((orgResponse.data ?? null) as OrganizationExtra | null);
    }

    if (!planResponse.error) {
      setSubscription((planResponse.data ?? null) as Subscription | null);
    }

    setLoading(false);
  }, [activeOrganization]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <EloLogo compact />

        <Text style={styles.eyebrow}>MINHA CONTA</Text>
        <Text style={styles.title}>{profile?.display_name ?? "Usuário"}</Text>
        <Text style={styles.context}>
          {activeOrganization?.name}
          {activeUnit?.name && activeUnit.name !== activeOrganization?.name
            ? ` • ${activeUnit.name}`
            : ""}
        </Text>

        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator />
          </View>
        ) : (
          <>
            <Text style={styles.sectionTitle}>Igreja</Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <P.KeyIcon size={21} color={eloColors.blue} weight="duotone" />
                </View>

                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>Código da igreja</Text>
                  <Text selectable style={styles.codeValue}>
                    {extra?.join_code ?? "Não disponível"}
                  </Text>
                  <Text style={styles.infoHint}>
                    Compartilhe com quem precisa entrar nesta igreja.
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <P.CrownIcon size={21} color={eloColors.yellow} weight="duotone" />
                </View>

                <View style={styles.infoCopy}>
                  <Text style={styles.infoLabel}>Plano Elo</Text>
                  <Text style={styles.planValue}>
                    {subscription?.plan_code ?? "Elo"}
                  </Text>
                  <Text style={styles.infoHint}>
                    {subscription
                      ? `Status: ${subscription.status}`
                      : "Sua igreja está usando o Elo."}
                  </Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Acessos</Text>

            <View style={styles.actions}>
              <ActionRow
                icon="BellIcon"
                title="Notificações"
                description="Central de alertas do Elo"
                onPress={() => navigation.navigate("Notificacoes")}
              />

              {canManage ? (
                <ActionRow
                  icon="ShieldCheckIcon"
                  title="Administração Elo"
                  description="Acessos, perfis, unidades e segurança"
                  onPress={() =>
                    navigation.navigate("Elo", {
                      module: "management",
                      nonce: Date.now(),
                    })
                  }
                />
              ) : null}

              {organizations.length > 1 ? (
                <ActionRow
                  icon="ArrowsLeftRightIcon"
                  title="Trocar igreja"
                  description="Mudar o contexto ativo"
                  onPress={() => {
                    void clearOrganizationSelection();
                  }}
                />
              ) : null}
            </View>

            <Text style={styles.sectionTitle}>Conta</Text>

            <Pressable onPress={handleSignOut} style={styles.signOut}>
              <P.SignOutIcon size={19} color={eloColors.danger} weight="bold" />
              <Text style={styles.signOutText}>Sair da conta</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function ActionRow({
  icon,
  title,
  description,
  onPress,
}: {
  icon: string;
  title: string;
  description: string;
  onPress: () => void;
}) {
  const Icon = P[icon] ?? P.SquaresFourIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.actionRow,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.actionIcon}>
        <Icon size={21} color={eloColors.blue} weight="duotone" />
      </View>

      <View style={styles.actionCopy}>
        <Text style={styles.actionTitle}>{title}</Text>
        <Text style={styles.actionDescription}>{description}</Text>
      </View>

      <P.CaretRightIcon size={18} color="#9AA4AE" weight="bold" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: eloColors.background,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  eyebrow: {
    marginTop: 22,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3,
    color: eloColors.muted,
  },
  title: {
    marginTop: 7,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "900",
    color: eloColors.ink,
  },
  context: {
    marginTop: 5,
    fontSize: 13,
    color: eloColors.muted,
  },
  loading: {
    paddingVertical: 60,
    alignItems: "center",
  },
  sectionTitle: {
    marginTop: 28,
    marginBottom: 10,
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.9,
    textTransform: "uppercase",
    color: eloColors.muted,
  },
  infoCard: {
    marginBottom: 10,
    padding: 15,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 18,
    backgroundColor: "#FFFFFF",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  infoIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
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
  codeValue: {
    marginTop: 4,
    fontSize: 21,
    fontWeight: "900",
    letterSpacing: 0.9,
    color: eloColors.ink,
  },
  planValue: {
    marginTop: 4,
    fontSize: 17,
    fontWeight: "900",
    color: eloColors.ink,
  },
  infoHint: {
    marginTop: 4,
    fontSize: 11,
    lineHeight: 16,
    color: eloColors.muted,
  },
  actions: {
    gap: 9,
  },
  actionRow: {
    minHeight: 78,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 17,
    backgroundColor: "#FFFFFF",
  },
  actionIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  actionCopy: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: eloColors.ink,
  },
  actionDescription: {
    marginTop: 3,
    fontSize: 11,
    color: eloColors.muted,
  },
  signOut: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#F0DADA",
    borderRadius: 16,
    backgroundColor: "#FFF8F8",
  },
  signOutText: {
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.danger,
  },
  pressed: {
    opacity: 0.76,
  },
});
