import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import { eloColors } from "./EloUi";

const P = Phosphor as any;

type GuardianCall = {
  call_id: string;
  checkin_id: string;
  requested_at: string;
  child_name: string;
  room_name: string;
};

export function KidsGuardianEmergencyOverlay() {
  const { activeOrganization } = useOrganization();
  const [call, setCall] = useState<GuardianCall | null>(null);
  const [acknowledging, setAcknowledging] = useState(false);
  const pulse = useRef(new Animated.Value(0)).current;

  const loadCall = useCallback(async () => {
    const organizationId = activeOrganization?.id;

    if (!organizationId) {
      setCall(null);
      return;
    }

    const { data, error } = await supabase.rpc(
      "get_my_active_kids_guardian_call",
      {
        p_organization_id: organizationId,
      }
    );

    if (!error) {
      setCall((data ?? null) as GuardianCall | null);
    }
  }, [activeOrganization?.id]);

  useEffect(() => {
    void loadCall();

    const organizationId = activeOrganization?.id;

    if (!organizationId) return;

    const channel = supabase
      .channel(`kids-guardian-overlay-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kids_guardian_calls",
          filter: `organization_id=eq.${organizationId}`,
        },
        () => {
          void loadCall();
        }
      )
      .subscribe();

    const interval = setInterval(() => {
      void loadCall();
    }, 5000);

    const appState = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void loadCall();
      }
    });

    return () => {
      clearInterval(interval);
      appState.remove();
      void supabase.removeChannel(channel);
    };
  }, [activeOrganization?.id, loadCall]);

  useEffect(() => {
    if (!call) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1100,
          useNativeDriver: false,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1100,
          useNativeDriver: false,
        }),
      ])
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [call, pulse]);

  async function acknowledge() {
    if (!call || acknowledging) return;

    setAcknowledging(true);

    try {
      const { error } = await supabase.rpc(
        "acknowledge_kid_guardian_call",
        {
          p_call_id: call.call_id,
        }
      );

      if (error) throw error;

      setCall(null);
    } finally {
      setAcknowledging(false);
    }
  }

  const backgroundColor = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: ["#FFF7F5", "#FFE5DF"],
  });

  return (
    <Modal
      visible={Boolean(call)}
      animationType="fade"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <Animated.View style={[styles.root, { backgroundColor }]}>
        <View style={styles.badge}>
          <P.BellRingingIcon
            size={26}
            color="#B42318"
            weight="fill"
          />
          <Text style={styles.badgeText}>CHAMADO DO ELO KIDS</Text>
        </View>

        <View style={styles.content}>
          <View style={styles.iconWrap}>
            <P.HandHeartIcon
              size={44}
              color="#B42318"
              weight="duotone"
            />
          </View>

          <Text style={styles.title}>
            A equipe precisa falar com você
          </Text>

          <Text style={styles.childName}>
            {call?.child_name ?? "Seu filho"}
          </Text>

          <Text style={styles.message}>
            Dirija-se agora à{" "}
            <Text style={styles.roomName}>
              {call?.room_name ?? "sala do Elo Kids"}
            </Text>
            .
          </Text>

          <Text style={styles.helper}>
            Este aviso permanece na tela até você confirmar que está indo.
          </Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            disabled={acknowledging}
            onPress={() => void acknowledge()}
            style={({ pressed }) => [
              styles.confirmButton,
              pressed && styles.pressed,
              acknowledging && styles.disabled,
            ]}
          >
            <P.PersonSimpleRunIcon
              size={22}
              color="#FFFFFF"
              weight="bold"
            />
            <Text style={styles.confirmText}>
              {acknowledging ? "Confirmando..." : "Estou indo para a sala"}
            </Text>
          </Pressable>

          <Text style={styles.safetyText}>
            O alerta usa uma pulsação visual lenta, sem efeito estroboscópico.
          </Text>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
    paddingBottom: 34,
  },
  badge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 0.7,
    color: "#B42318",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrap: {
    width: 84,
    height: 84,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 28,
    backgroundColor: "#FFFFFF",
  },
  title: {
    marginTop: 24,
    maxWidth: 330,
    textAlign: "center",
    fontSize: 28,
    lineHeight: 34,
    fontWeight: "900",
    color: eloColors.ink,
  },
  childName: {
    marginTop: 12,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "900",
    color: "#B42318",
  },
  message: {
    marginTop: 14,
    maxWidth: 330,
    textAlign: "center",
    fontSize: 16,
    lineHeight: 24,
    color: "#5E3934",
  },
  roomName: {
    fontWeight: "900",
  },
  helper: {
    marginTop: 16,
    maxWidth: 320,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    color: "#7F625E",
  },
  footer: {
    gap: 12,
  },
  confirmButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    paddingHorizontal: 18,
    borderRadius: 18,
    backgroundColor: "#B42318",
  },
  confirmText: {
    fontSize: 15,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  safetyText: {
    textAlign: "center",
    fontSize: 10,
    lineHeight: 15,
    color: "#886E6A",
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.58,
  },
});
