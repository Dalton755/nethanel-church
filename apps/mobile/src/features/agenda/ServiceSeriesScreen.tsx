import { useMemo, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import { supabase } from "../../lib/supabase";
import {
  EloActionButton,
  EloCard,
  EloScreen,
  eloColors,
  eloSharedStyles,
} from "../elo/EloUi";

const P = Phosphor as any;

export type SeriesRoutine = {
  id: string;
  name: string;
};

type Props = {
  routine: SeriesRoutine;
  onBack: () => void;
  onSaved: () => Promise<void>;
};

function localDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(value: Date, days: number) {
  const next = new Date(
    value.getFullYear(),
    value.getMonth(),
    value.getDate()
  );
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(value: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(value);
}

export function ServiceSeriesScreen({
  routine,
  onBack,
  onSaved,
}: Props) {
  const { activeOrganization, permissions } = useOrganization();

  const [name, setName] = useState("");
  const [durationText, setDurationText] = useState("40");
  const [started, setStarted] = useState(false);
  const [currentDayText, setCurrentDayText] = useState("1");
  const [referenceDate, setReferenceDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);

  const canManage =
    permissions.includes("services.manage") &&
    permissions.includes("agenda.manage");

  const duration = Math.max(
    0,
    Number.parseInt(durationText.replace(/\D/g, ""), 10) || 0
  );

  const currentDay = Math.max(
    1,
    Number.parseInt(currentDayText.replace(/\D/g, ""), 10) || 1
  );

  const calculated = useMemo(() => {
    if (duration < 1) return null;

    const safeCurrent = Math.min(currentDay, duration);
    const startDate = started
      ? addDays(referenceDate, -(safeCurrent - 1))
      : referenceDate;
    const endDate = addDays(startDate, duration - 1);

    return {
      startDate,
      endDate,
      progress: started ? safeCurrent : 0,
    };
  }, [duration, currentDay, started, referenceDate]);

  function handleDateChange(
    event: DateTimePickerEvent,
    value?: Date
  ) {
    if (Platform.OS === "android") {
      setShowDatePicker(false);
    }

    if (event.type === "dismissed" || !value) return;

    setReferenceDate(
      new Date(value.getFullYear(), value.getMonth(), value.getDate())
    );
  }

  async function save() {
    if (!activeOrganization) return;

    if (!canManage) {
      Alert.alert(
        "Sem permissão",
        "Seu perfil não pode criar séries de culto."
      );
      return;
    }

    if (name.trim().length < 2) {
      Alert.alert("Nome necessário", "Informe o nome da série.");
      return;
    }

    if (duration < 2) {
      Alert.alert(
        "Duração inválida",
        "A série precisa ter pelo menos 2 dias."
      );
      return;
    }

    if (started && currentDay > duration) {
      Alert.alert(
        "Progresso inválido",
        "O dia atual não pode ser maior que a duração da série."
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc(
        "create_service_series_smart",
        {
          p_organization_id: activeOrganization.id,
          p_routine_id: routine.id,
          p_name: name.trim(),
          p_theme: name.trim(),
          p_mode: "DAYS",
          p_total: duration,
          p_current_value: started ? currentDay : 1,
          p_reference_date: localDate(referenceDate),
          p_until_date: null,
        }
      );

      if (error) throw error;

      await onSaved();
    } catch (error) {
      Alert.alert(
        "Série não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <EloScreen
      title="Nova série"
      eyebrow="ELO • SÉRIE"
      subtitle={routine.name}
      onBack={onBack}
    >
      <Text style={eloSharedStyles.sectionTitle}>Série do culto</Text>

      <Text style={styles.label}>Nome da série</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ex.: As Parábolas de Jesus"
        placeholderTextColor="#A1A9B0"
        style={styles.input}
      />

      <Text style={styles.label}>Duração</Text>
      <View style={styles.numberRow}>
        <TextInput
          value={durationText}
          onChangeText={(value) =>
            setDurationText(value.replace(/\D/g, ""))
          }
          keyboardType="number-pad"
          placeholder="40"
          placeholderTextColor="#A1A9B0"
          style={[styles.input, styles.numberInput]}
        />
        <Text style={styles.unitLabel}>dias</Text>
      </View>

      <Text style={styles.label}>Já começou?</Text>
      <View style={styles.choiceRow}>
        <Choice
          label="Não"
          selected={!started}
          onPress={() => {
            setStarted(false);
            setReferenceDate(new Date());
          }}
        />
        <Choice
          label="Sim"
          selected={started}
          onPress={() => {
            setStarted(true);
            setReferenceDate(new Date());
          }}
        />
      </View>

      {started ? (
        <>
          <Text style={styles.label}>Está em qual dia?</Text>
          <View style={styles.numberRow}>
            <TextInput
              value={currentDayText}
              onChangeText={(value) =>
                setCurrentDayText(value.replace(/\D/g, ""))
              }
              keyboardType="number-pad"
              placeholder="25"
              placeholderTextColor="#A1A9B0"
              style={[styles.input, styles.numberInput]}
            />
            <Text style={styles.unitLabel}>
              / {duration || "—"}
            </Text>
          </View>

          <View style={styles.infoBox}>
            <P.MagicWandIcon
              size={20}
              color={eloColors.blue}
              weight="duotone"
            />
            <Text style={styles.infoText}>
              O Elo usa hoje como referência e calcula automaticamente
              quando a série começou e quando termina.
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text style={styles.label}>Começa quando?</Text>
          <Pressable
            onPress={() => setShowDatePicker(true)}
            style={styles.selectField}
          >
            <P.CalendarDotsIcon
              size={20}
              color={eloColors.blue}
              weight="duotone"
            />
            <Text style={styles.selectValue}>
              {formatDate(referenceDate)}
            </Text>
            <P.CaretRightIcon
              size={18}
              color="#9AA4AE"
              weight="bold"
            />
          </Pressable>
        </>
      )}

      {calculated ? (
        <>
          <Text style={eloSharedStyles.sectionTitle}>Prévia</Text>
          <EloCard>
            <View style={styles.previewHeader}>
              <View style={styles.seriesIcon}>
                <P.BookOpenTextIcon
                  size={22}
                  color={eloColors.blue}
                  weight="duotone"
                />
              </View>
              <View style={styles.previewCopy}>
                <Text style={eloSharedStyles.cardTitle}>
                  {name.trim() || "Sua série"}
                </Text>
                <Text style={styles.previewMeta}>
                  {started
                    ? `Dia ${calculated.progress}/${duration}`
                    : `${duration} dias`}
                </Text>
              </View>
            </View>

            <View style={styles.separator} />

            <Text style={styles.previewLine}>
              Início: {formatDate(calculated.startDate)}
            </Text>
            <Text style={styles.previewLine}>
              Término: {formatDate(calculated.endDate)}
            </Text>
          </EloCard>
        </>
      ) : null}

      <View style={styles.footer}>
        <EloActionButton
          label="Criar série"
          icon="SparkleIcon"
          loading={saving}
          onPress={() => void save()}
        />
      </View>

      {showDatePicker ? (
        <DateTimePicker
          value={referenceDate}
          mode="date"
          minimumDate={new Date()}
          onChange={handleDateChange}
        />
      ) : null}
    </EloScreen>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.choice,
        selected && styles.choiceSelected,
      ]}
    >
      <View
        style={[
          styles.choiceDot,
          selected && styles.choiceDotSelected,
        ]}
      />
      <Text
        style={[
          styles.choiceText,
          selected && styles.choiceTextSelected,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: {
    marginTop: 18,
    marginBottom: 7,
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.ink,
  },
  input: {
    minHeight: 52,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
    fontSize: 15,
    color: eloColors.ink,
  },
  numberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  numberInput: {
    flex: 1,
  },
  unitLabel: {
    minWidth: 52,
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.muted,
  },
  choiceRow: {
    flexDirection: "row",
    gap: 10,
  },
  choice: {
    flex: 1,
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  choiceSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  choiceDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: eloColors.muted,
  },
  choiceDotSelected: {
    borderColor: eloColors.blue,
    backgroundColor: eloColors.blue,
  },
  choiceText: {
    fontSize: 14,
    fontWeight: "800",
    color: eloColors.muted,
  },
  choiceTextSelected: {
    color: eloColors.blue,
  },
  selectField: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 15,
    backgroundColor: "#FFFFFF",
  },
  selectValue: {
    flex: 1,
    fontSize: 15,
    fontWeight: "700",
    color: eloColors.ink,
  },
  infoBox: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    padding: 13,
    borderRadius: 15,
    backgroundColor: "#EAF5FB",
  },
  infoText: {
    flex: 1,
    fontSize: 11,
    lineHeight: 17,
    color: "#557084",
  },
  previewHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  seriesIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  previewCopy: {
    flex: 1,
  },
  previewMeta: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: "800",
    color: eloColors.blue,
  },
  separator: {
    height: 1,
    marginVertical: 14,
    backgroundColor: eloColors.line,
  },
  previewLine: {
    marginTop: 4,
    fontSize: 12,
    color: eloColors.muted,
  },
  footer: {
    marginTop: 26,
  },
});
