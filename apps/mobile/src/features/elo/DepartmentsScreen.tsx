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

type Department = {
  id: string;
  name: string;
  description: string | null;
  leader_person_id: string | null;
  leader_name: string | null;
  member_count: number;
  function_count: number;
  active: boolean;
};

export function DepartmentsScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    activeUnit,
    can,
    canAtOrganization,
  } = useOrganization();

  const canManage =
    can("departments.manage") ||
    canAtOrganization("departments.manage");

  const [items, setItems] = useState<Department[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    try {
      const { data, error } = await supabase.rpc("list_departments_detailed", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
      });

      if (error) throw error;
      setItems((data ?? []) as Department[]);
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Não foi possível carregar os departamentos."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createDepartment() {
    if (!activeOrganization || !activeUnit) return;
    if (name.trim().length < 2) {
      Alert.alert("Nome necessário", "Informe o nome do departamento.");
      return;
    }

    setSaving(true);

    try {
      const { error } = await supabase.rpc("create_department", {
        p_organization_id: activeOrganization.id,
        p_unit_id: activeUnit.id,
        p_name: name.trim(),
        p_description: description.trim() || null,
        p_leader_person_id: null,
      });

      if (error) throw error;

      setName("");
      setDescription("");
      setShowCreate(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Departamento não criado",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <EloScreen
      title="Departamentos"
      eyebrow="ELO • EQUIPES"
      subtitle="Ministérios, equipes e pessoas que fazem a igreja funcionar."
      onBack={onBack}
    >
      {canManage ? (
        <View style={styles.topAction}>
          <EloActionButton
            label={showCreate ? "Fechar cadastro" : "Novo departamento"}
            variant={showCreate ? "secondary" : "primary"}
            icon={showCreate ? "XIcon" : "PlusIcon"}
            onPress={() => setShowCreate((value) => !value)}
          />
        </View>
      ) : null}

      {showCreate ? (
        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>Novo departamento</Text>

          <Text style={styles.label}>Nome</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Ex.: Louvor"
            style={styles.input}
          />

          <Text style={styles.label}>Descrição</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="Opcional"
            multiline
            style={[styles.input, styles.textarea]}
          />

          <EloActionButton
            label="Criar departamento"
            loading={saving}
            onPress={() => void createDepartment()}
          />
        </EloCard>
      ) : null}

      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : errorMessage ? (
        <EloState
          title="Não conseguimos carregar os departamentos"
          description={errorMessage}
          icon="WarningCircleIcon"
        />
      ) : items.length === 0 ? (
        <View style={styles.stateWrap}>
          <EloState
            title="Nenhum departamento ainda"
            description={
              canManage
                ? "Crie o primeiro departamento para começar a organizar equipes e escalas."
                : "A liderança ainda não publicou departamentos para esta unidade."
            }
            icon="UsersThreeIcon"
          />
        </View>
      ) : (
        <View style={styles.list}>
          {items.map((item) => (
            <EloCard key={item.id}>
              <View style={styles.header}>
                <View style={styles.iconWrap}>
                  <P.UsersThreeIcon
                    size={22}
                    color={eloColors.blue}
                    weight="duotone"
                  />
                </View>

                <View style={styles.headerCopy}>
                  <Text style={eloSharedStyles.cardTitle}>{item.name}</Text>
                  <Text style={styles.meta}>
                    {item.member_count} membro{item.member_count === 1 ? "" : "s"}
                    {item.leader_name ? ` • Líder: ${item.leader_name}` : ""}
                  </Text>
                </View>
              </View>

              {item.description ? (
                <Text style={eloSharedStyles.cardText}>{item.description}</Text>
              ) : null}
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
    minHeight: 92,
    marginBottom: 14,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  stateWrap: {
    marginTop: 14,
  },
  list: {
    marginTop: 18,
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
    marginTop: 4,
    fontSize: 11,
    color: eloColors.muted,
  },
});
