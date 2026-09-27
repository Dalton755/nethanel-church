import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Phosphor from "phosphor-react-native";

import { useOrganization } from "../../contexts/OrganizationContext";
import {
  formatCurrencyInputBr,
  formatMoneyInputBr,
  maskCurrencyBr,
  maskDateBr,
  maskMoneyBr,
  parseDateBrToIso,
  parseMoneyBr,
} from "../../lib/inputMasks";
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

type Dashboard = {
  month_start: string;
  month_income: number | string;
  month_expense: number | string;
  month_result: number | string;
  balance: number | string;
  payables: number | string;
  payables_count: number;
  receivables: number | string;
  receivables_count: number;
  pending_closures: number;
};

type Account = {
  account_id: string;
  account_name: string;
  account_type: "cash" | "bank" | "wallet";
  initial_balance: number | string;
  current_balance: number | string;
  active: boolean;
};

type Category = {
  category_id: string;
  kind: "income" | "expense";
  category_name: string;
  system_key: string | null;
  active: boolean;
};

type Transaction = {
  transaction_id: string;
  kind: "income" | "expense";
  amount: number | string;
  description: string;
  occurred_on: string;
  due_on: string | null;
  paid_on: string | null;
  status: "pending" | "paid" | "cancelled";
  payment_method: string | null;
  reference: string | null;
  category_id: string;
  category_name: string;
  account_id: string;
  account_name: string;
  unit_id: string | null;
  event_id: string | null;
  department_id: string | null;
  source: string;
};

type BudgetStatus = {
  category_id: string;
  category_name: string;
  planned_amount: number | string;
  actual_amount: number | string;
  remaining_amount: number | string;
};

type ServiceCandidate = {
  event_id: string;
  event_title: string;
  starts_at: string;
  closure_id: string | null;
  closure_status: string | null;
  total_amount: number | string | null;
};

type Closure = {
  closure_id: string;
  status: string;
  cash_amount: number | string;
  pix_amount: number | string;
  card_amount: number | string;
  other_amount: number | string;
  total_amount: number | string;
  notes: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
};

function money(value: number | string | null | undefined) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value ?? 0));
}

function formatDate(value: string | null) {
  if (!value) return "Sem vencimento";

  const [year, month, day] = value.slice(0, 10).split("-");

  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function todayBr() {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());
}

function closureStatusLabel(value: string | null) {
  switch (value) {
    case "draft":
      return "Rascunho";
    case "submitted":
      return "Aguardando conferência";
    case "approved":
      return "Fechado";
    default:
      return "Não iniciado";
  }
}


type CalculatorOperation = "+" | "-" | "×" | "÷";

function calculatorNumber(value: string) {
  return Number(value.replace(",", ".")) || 0;
}

function formatCalculatorNumber(value: number) {
  if (!Number.isFinite(value)) {
    return "0";
  }

  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 4,
    useGrouping: false,
  }).format(value);
}

function calculateValue(
  left: number,
  right: number,
  operation: CalculatorOperation
) {
  switch (operation) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "×":
      return left * right;
    case "÷":
      return right === 0 ? left : left / right;
  }
}

function MoneyCalculatorInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const [display, setDisplay] = useState("0");
  const [accumulator, setAccumulator] = useState<number | null>(null);
  const [operation, setOperation] =
    useState<CalculatorOperation | null>(null);
  const [freshInput, setFreshInput] = useState(true);

  const CalculatorIcon =
    P.CalculatorIcon ?? P.HashIcon ?? P.PlusMinusIcon;

  function openCalculator() {
    const current = parseMoneyBr(value);

    setDisplay(
      formatCalculatorNumber(
        Number.isFinite(current) ? current : 0
      )
    );
    setAccumulator(null);
    setOperation(null);
    setFreshInput(true);
    setVisible(true);
  }

  function appendDigit(digit: string) {
    setDisplay((current) => {
      if (freshInput || current === "0") {
        return digit;
      }

      if (current.replace(/\D/g, "").length >= 12) {
        return current;
      }

      return current + digit;
    });

    setFreshInput(false);
  }

  function appendDecimal() {
    setDisplay((current) => {
      if (freshInput) {
        return "0,";
      }

      return current.includes(",") ? current : current + ",";
    });

    setFreshInput(false);
  }

  function chooseOperation(nextOperation: CalculatorOperation) {
    const current = calculatorNumber(display);
    let nextAccumulator = current;

    if (accumulator !== null && operation) {
      nextAccumulator = calculateValue(
        accumulator,
        current,
        operation
      );
    }

    setAccumulator(nextAccumulator);
    setDisplay(formatCalculatorNumber(nextAccumulator));
    setOperation(nextOperation);
    setFreshInput(true);
  }

  function equals() {
    if (accumulator === null || !operation) {
      return;
    }

    const result = calculateValue(
      accumulator,
      calculatorNumber(display),
      operation
    );

    setDisplay(formatCalculatorNumber(result));
    setAccumulator(null);
    setOperation(null);
    setFreshInput(true);
  }

  function clearCalculator() {
    setDisplay("0");
    setAccumulator(null);
    setOperation(null);
    setFreshInput(true);
  }

  function backspace() {
    if (freshInput) {
      return;
    }

    setDisplay((current) => {
      if (current.length <= 1) {
        return "0";
      }

      return current.slice(0, -1);
    });
  }

  function applyCalculator() {
    let result = calculatorNumber(display);

    if (accumulator !== null && operation) {
      result = calculateValue(
        accumulator,
        result,
        operation
      );
    }

    onChange(formatCurrencyInputBr(result));
    setVisible(false);
  }

  const keys: Array<
    | { label: string; type: "digit"; value: string }
    | { label: string; type: "decimal" }
    | { label: string; type: "operation"; value: CalculatorOperation }
    | { label: string; type: "clear" }
    | { label: string; type: "backspace" }
    | { label: string; type: "equals" }
  > = [
    { label: "C", type: "clear" },
    { label: "⌫", type: "backspace" },
    { label: "÷", type: "operation", value: "÷" },
    { label: "×", type: "operation", value: "×" },
    { label: "7", type: "digit", value: "7" },
    { label: "8", type: "digit", value: "8" },
    { label: "9", type: "digit", value: "9" },
    { label: "−", type: "operation", value: "-" },
    { label: "4", type: "digit", value: "4" },
    { label: "5", type: "digit", value: "5" },
    { label: "6", type: "digit", value: "6" },
    { label: "+", type: "operation", value: "+" },
    { label: "1", type: "digit", value: "1" },
    { label: "2", type: "digit", value: "2" },
    { label: "3", type: "digit", value: "3" },
    { label: "=", type: "equals" },
    { label: "0", type: "digit", value: "0" },
    { label: ",", type: "decimal" },
  ];

  function pressKey(key: (typeof keys)[number]) {
    switch (key.type) {
      case "digit":
        appendDigit(key.value);
        break;
      case "decimal":
        appendDecimal();
        break;
      case "operation":
        chooseOperation(key.value);
        break;
      case "clear":
        clearCalculator();
        break;
      case "backspace":
        backspace();
        break;
      case "equals":
        equals();
        break;
    }
  }

  return (
    <>
      <View style={styles.moneyInputWrap}>
        <TextInput
          value={value}
          onChangeText={(text) =>
            onChange(maskCurrencyBr(text))
          }
          keyboardType="number-pad"
          placeholder="R$ 0,00"
          placeholderTextColor="#A1A9B0"
          style={styles.moneyInput}
        />

        <Pressable
          accessibilityLabel="Abrir calculadora"
          onPress={openCalculator}
          style={({ pressed }) => [
            styles.calculatorTrigger,
            pressed && styles.calculatorPressed,
          ]}
        >
          <CalculatorIcon
            size={21}
            color={eloColors.blue}
            weight="duotone"
          />
        </Pressable>
      </View>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <View style={styles.calculatorBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setVisible(false)}
          />

          <View style={styles.calculatorCard}>
            <View style={styles.calculatorTop}>
              <View>
                <Text style={styles.calculatorEyebrow}>
                  CALCULADORA
                </Text>
                <Text style={styles.calculatorHint}>
                  O resultado volta direto para o campo Valor.
                </Text>
              </View>

              <Pressable
                onPress={() => setVisible(false)}
                style={styles.calculatorClose}
              >
                <P.XIcon
                  size={19}
                  color={eloColors.ink}
                  weight="bold"
                />
              </Pressable>
            </View>

            <View style={styles.calculatorDisplay}>
              <Text style={styles.calculatorCurrency}>R$</Text>
              <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                style={styles.calculatorDisplayText}
              >
                {display}
              </Text>
            </View>

            <View style={styles.calculatorGrid}>
              {keys.map((key, index) => {
                const operationKey =
                  key.type === "operation" ||
                  key.type === "equals";

                const wide =
                  key.type === "digit" &&
                  key.value === "0";

                return (
                  <Pressable
                    key={`${key.label}-${index}`}
                    onPress={() => pressKey(key)}
                    style={({ pressed }) => [
                      styles.calculatorKey,
                      operationKey &&
                        styles.calculatorKeyOperation,
                      wide && styles.calculatorKeyWide,
                      pressed && styles.calculatorPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.calculatorKeyText,
                        operationKey &&
                          styles.calculatorKeyTextOperation,
                      ]}
                    >
                      {key.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <EloActionButton
              label="Usar este valor"
              icon="CheckIcon"
              onPress={applyCalculator}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

export function FinanceScreen({ onBack }: { onBack: () => void }) {
  const {
    activeOrganization,
    activeUnit,
    canAtOrganization,
  } = useOrganization();

  const canManage = canAtOrganization("finance.manage");

  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [services, setServices] = useState<ServiceCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  const [showTransactionForm, setShowTransactionForm] = useState(false);
  const [transactionKind, setTransactionKind] =
    useState<"income" | "expense">("income");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionDescription, setTransactionDescription] = useState("");
  const [transactionDate, setTransactionDate] = useState(todayBr());
  const [transactionDueDate, setTransactionDueDate] = useState("");
  const [transactionStatus, setTransactionStatus] =
    useState<"paid" | "pending">("paid");
  const [paymentMethod, setPaymentMethod] = useState("pix");
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] =
    useState<string | null>(null);
  const [savingTransaction, setSavingTransaction] = useState(false);

  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [budgetCategoryId, setBudgetCategoryId] =
    useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState("");
  const [savingBudget, setSavingBudget] = useState(false);

  const [showStructure, setShowStructure] = useState(false);
  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] =
    useState<"cash" | "bank" | "wallet">("bank");
  const [accountOpeningBalance, setAccountOpeningBalance] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [categoryKind, setCategoryKind] =
    useState<"income" | "expense">("expense");
  const [savingStructure, setSavingStructure] = useState(false);

  const [selectedService, setSelectedService] =
    useState<ServiceCandidate | null>(null);
  const [closure, setClosure] = useState<Closure | null>(null);
  const [closureCash, setClosureCash] = useState("0");
  const [closurePix, setClosurePix] = useState("0");
  const [closureCard, setClosureCard] = useState("0");
  const [closureOther, setClosureOther] = useState("0");
  const [closureNotes, setClosureNotes] = useState("");
  const [savingClosure, setSavingClosure] = useState(false);
  const [approvingClosureId, setApprovingClosureId] =
    useState<string | null>(null);

  const currentCategories = useMemo(
    () =>
      categories.filter(
        (item) => item.active && item.kind === transactionKind
      ),
    [categories, transactionKind]
  );

  const expenseCategories = useMemo(
    () =>
      categories.filter(
        (item) => item.active && item.kind === "expense"
      ),
    [categories]
  );

  const activeAccounts = useMemo(
    () => accounts.filter((item) => item.active),
    [accounts]
  );

  const pendingTransactions = useMemo(
    () =>
      transactions.filter(
        (item) => item.status === "pending"
      ),
    [transactions]
  );

  const recentTransactions = useMemo(
    () =>
      transactions
        .filter((item) => item.status !== "cancelled")
        .slice(0, 12),
    [transactions]
  );

  const load = useCallback(async () => {
    if (!activeOrganization || !activeUnit) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const [
        dashboardResponse,
        accountsResponse,
        categoriesResponse,
        transactionsResponse,
        budgetsResponse,
        servicesResponse,
      ] = await Promise.all([
        supabase.rpc("get_finance_dashboard", {
          p_organization_id: activeOrganization.id,
        }),
        supabase.rpc("list_finance_accounts", {
          p_organization_id: activeOrganization.id,
        }),
        supabase.rpc("list_finance_categories", {
          p_organization_id: activeOrganization.id,
          p_kind: null,
        }),
        supabase.rpc("list_finance_transactions", {
          p_organization_id: activeOrganization.id,
          p_from: null,
          p_to: null,
          p_status: null,
          p_limit: 100,
        }),
        supabase.rpc("list_finance_budget_status", {
          p_organization_id: activeOrganization.id,
          p_month_start: null,
        }),
        supabase.rpc("list_finance_service_candidates", {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
        }),
      ]);

      if (dashboardResponse.error) throw dashboardResponse.error;
      if (accountsResponse.error) throw accountsResponse.error;
      if (categoriesResponse.error) throw categoriesResponse.error;
      if (transactionsResponse.error) throw transactionsResponse.error;
      if (budgetsResponse.error) throw budgetsResponse.error;
      if (servicesResponse.error) throw servicesResponse.error;

      const nextAccounts = (accountsResponse.data ?? []) as Account[];
      const nextCategories =
        (categoriesResponse.data ?? []) as Category[];

      setDashboard((dashboardResponse.data ?? null) as Dashboard | null);
      setAccounts(nextAccounts);
      setCategories(nextCategories);
      setTransactions(
        (transactionsResponse.data ?? []) as Transaction[]
      );
      setBudgets((budgetsResponse.data ?? []) as BudgetStatus[]);
      setServices(
        (servicesResponse.data ?? []) as ServiceCandidate[]
      );

      // Seleções de formulário são estado local. Não devem disparar
      // um reload completo do financeiro nem serem sobrescritas aqui.
    } catch (error) {
      Alert.alert(
        "Financeiro",
        error instanceof Error
          ? error.message
          : "Não foi possível carregar o financeiro."
      );
    } finally {
      setLoading(false);
    }
  }, [activeOrganization, activeUnit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedAccountId((current) => {
      if (
        current &&
        activeAccounts.some((item) => item.account_id === current)
      ) {
        return current;
      }

      return activeAccounts[0]?.account_id ?? null;
    });
  }, [activeAccounts]);

  useEffect(() => {
    setSelectedCategoryId((current) => {
      if (
        current &&
        currentCategories.some(
          (item) => item.category_id === current
        )
      ) {
        return current;
      }

      return currentCategories[0]?.category_id ?? null;
    });
  }, [currentCategories]);

  useEffect(() => {
    setBudgetCategoryId((current) => {
      if (
        current &&
        expenseCategories.some(
          (item) => item.category_id === current
        )
      ) {
        return current;
      }

      return expenseCategories[0]?.category_id ?? null;
    });
  }, [expenseCategories]);

  async function saveTransaction() {
    if (
      !activeOrganization ||
      !activeUnit ||
      !selectedAccountId ||
      !selectedCategoryId
    ) {
      Alert.alert(
        "Dados incompletos",
        "Escolha conta e categoria."
      );
      return;
    }

    const amount = parseMoneyBr(transactionAmount);
    const occurredOn = parseDateBrToIso(transactionDate);
    const dueOn = parseDateBrToIso(transactionDueDate);

    if (!Number.isFinite(amount) || amount <= 0) {
      Alert.alert("Valor inválido", "Informe um valor maior que zero.");
      return;
    }

    if (!occurredOn) {
      Alert.alert(
        "Data inválida",
        "Use o formato dd/mm/aaaa."
      );
      return;
    }

    if (transactionStatus === "pending" && !dueOn) {
      Alert.alert(
        "Vencimento necessário",
        "Informe a data de vencimento da conta."
      );
      return;
    }

    if (transactionDescription.trim().length < 2) {
      Alert.alert(
        "Descrição necessária",
        "Informe o que está sendo registrado."
      );
      return;
    }

    setSavingTransaction(true);

    try {
      const { error } = await supabase.rpc(
        "save_finance_transaction",
        {
          p_organization_id: activeOrganization.id,
          p_transaction_id: null,
          p_unit_id: activeUnit.id,
          p_account_id: selectedAccountId,
          p_category_id: selectedCategoryId,
          p_kind: transactionKind,
          p_amount: amount,
          p_description: transactionDescription.trim(),
          p_occurred_on: occurredOn,
          p_due_on:
            transactionStatus === "pending" ? dueOn : null,
          p_status: transactionStatus,
          p_payment_method:
            transactionStatus === "paid" ? paymentMethod : null,
          p_reference: null,
          p_notes: null,
          p_department_id: null,
          p_event_id: null,
          p_person_id: null,
        }
      );

      if (error) throw error;

      setShowTransactionForm(false);
      setTransactionAmount("");
      setTransactionDescription("");
      setTransactionDate(todayBr());
      setTransactionDueDate("");
      setTransactionStatus("paid");
      await load();
    } catch (error) {
      Alert.alert(
        "Lançamento não salvo",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingTransaction(false);
    }
  }

  async function markPaid(item: Transaction) {
    if (!activeOrganization) return;

    try {
      const { error } = await supabase.rpc(
        "mark_finance_transaction_paid",
        {
          p_organization_id: activeOrganization.id,
          p_transaction_id: item.transaction_id,
          p_paid_on: new Date().toISOString().slice(0, 10),
          p_payment_method: null,
        }
      );

      if (error) throw error;
      await load();
    } catch (error) {
      Alert.alert(
        "Não foi possível marcar como pago",
        error instanceof Error ? error.message : "Tente novamente."
      );
    }
  }

  async function saveBudget() {
    if (!activeOrganization || !budgetCategoryId) return;

    const amount = parseMoneyBr(budgetAmount);

    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert("Valor inválido", "Informe o orçamento mensal.");
      return;
    }

    setSavingBudget(true);

    try {
      const { error } = await supabase.rpc(
        "save_finance_budget",
        {
          p_organization_id: activeOrganization.id,
          p_category_id: budgetCategoryId,
          p_month_start: new Date().toISOString().slice(0, 10),
          p_planned_amount: amount,
          p_notes: null,
        }
      );

      if (error) throw error;

      setBudgetAmount("");
      setShowBudgetForm(false);
      await load();
    } catch (error) {
      Alert.alert(
        "Orçamento não salvo",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingBudget(false);
    }
  }

  async function saveAccount() {
    if (!activeOrganization) return;

    const opening = parseMoneyBr(accountOpeningBalance);

    if (accountName.trim().length < 2) {
      Alert.alert("Nome necessário", "Informe o nome da conta.");
      return;
    }

    setSavingStructure(true);

    try {
      const { error } = await supabase.rpc("save_finance_account", {
        p_organization_id: activeOrganization.id,
        p_account_id: null,
        p_name: accountName.trim(),
        p_account_type: accountType,
        p_initial_balance: Number.isFinite(opening) ? opening : 0,
      });

      if (error) throw error;

      setAccountName("");
      setAccountOpeningBalance("");
      await load();
    } catch (error) {
      Alert.alert(
        "Conta não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingStructure(false);
    }
  }

  async function saveCategory() {
    if (!activeOrganization) return;

    if (categoryName.trim().length < 2) {
      Alert.alert("Nome necessário", "Informe o nome da categoria.");
      return;
    }

    setSavingStructure(true);

    try {
      const { error } = await supabase.rpc("save_finance_category", {
        p_organization_id: activeOrganization.id,
        p_category_id: null,
        p_kind: categoryKind,
        p_name: categoryName.trim(),
      });

      if (error) throw error;

      setCategoryName("");
      await load();
    } catch (error) {
      Alert.alert(
        "Categoria não criada",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingStructure(false);
    }
  }

  async function openClosure(service: ServiceCandidate) {
    if (!activeOrganization) return;

    setSelectedService(service);

    try {
      const { data, error } = await supabase.rpc(
        "get_finance_service_closure",
        {
          p_organization_id: activeOrganization.id,
          p_event_id: service.event_id,
        }
      );

      if (error) throw error;

      const existing = ((data ?? [])[0] ?? null) as Closure | null;

      setClosure(existing);
      setClosureCash(formatMoneyInputBr(existing?.cash_amount));
      setClosurePix(formatMoneyInputBr(existing?.pix_amount));
      setClosureCard(formatMoneyInputBr(existing?.card_amount));
      setClosureOther(formatMoneyInputBr(existing?.other_amount));
      setClosureNotes(existing?.notes ?? "");
    } catch (error) {
      Alert.alert(
        "Fechamento",
        error instanceof Error ? error.message : "Não foi possível abrir."
      );
    }
  }

  async function saveClosure(submit: boolean) {
    if (!activeOrganization || !activeUnit || !selectedService) return;

    const values = [
      parseMoneyBr(closureCash),
      parseMoneyBr(closurePix),
      parseMoneyBr(closureCard),
      parseMoneyBr(closureOther),
    ];

    if (values.some((value) => !Number.isFinite(value) || value < 0)) {
      Alert.alert("Valores inválidos", "Revise os valores do fechamento.");
      return;
    }

    setSavingClosure(true);

    try {
      const { error } = await supabase.rpc(
        "save_finance_service_closure",
        {
          p_organization_id: activeOrganization.id,
          p_unit_id: activeUnit.id,
          p_event_id: selectedService.event_id,
          p_cash_amount: values[0],
          p_pix_amount: values[1],
          p_card_amount: values[2],
          p_other_amount: values[3],
          p_notes: closureNotes.trim() || null,
          p_submit: submit,
        }
      );

      if (error) throw error;

      setSelectedService(null);
      setClosure(null);
      await load();

      if (submit) {
        Alert.alert(
          "Enviado para conferência",
          "Outro usuário com permissão financeira precisa conferir e aprovar o fechamento."
        );
      }
    } catch (error) {
      Alert.alert(
        "Fechamento não salvo",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setSavingClosure(false);
    }
  }

  async function approveClosure(item: ServiceCandidate) {
    if (!activeOrganization || !item.closure_id) return;

    setApprovingClosureId(item.closure_id);

    try {
      const { error } = await supabase.rpc(
        "approve_finance_service_closure",
        {
          p_organization_id: activeOrganization.id,
          p_closure_id: item.closure_id,
        }
      );

      if (error) throw error;

      await load();

      Alert.alert(
        "Fechamento aprovado",
        "A oferta do culto foi lançada no financeiro."
      );
    } catch (error) {
      Alert.alert(
        "Não foi possível aprovar",
        error instanceof Error ? error.message : "Tente novamente."
      );
    } finally {
      setApprovingClosureId(null);
    }
  }

  if (selectedService) {
    const total =
      parseMoneyBr(closureCash) +
      parseMoneyBr(closurePix) +
      parseMoneyBr(closureCard) +
      parseMoneyBr(closureOther);

    return (
      <EloScreen
        title="Fechamento do culto"
        eyebrow="ELO • FINANCEIRO"
        subtitle={selectedService.event_title}
        onBack={() => {
          setSelectedService(null);
          setClosure(null);
        }}
      >
        <View style={styles.closureContext}>
          <P.CalendarCheckIcon
            size={19}
            color={eloColors.blue}
            weight="duotone"
          />
          <View style={styles.grow}>
            <Text style={styles.closureDate}>
              {formatDateTime(selectedService.starts_at)}
            </Text>
            <Text style={styles.closureStatus}>
              {closureStatusLabel(closure?.status ?? null)}
            </Text>
          </View>
        </View>

        <EloCard>
          <Text style={eloSharedStyles.cardTitle}>
            Valores conferidos
          </Text>

          <Text style={styles.label}>Dinheiro</Text>
          <TextInput
            value={closureCash}
            onChangeText={(value) => setClosureCash(maskMoneyBr(value))}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>PIX identificado</Text>
          <TextInput
            value={closurePix}
            onChangeText={(value) => setClosurePix(maskMoneyBr(value))}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Cartão / maquininha</Text>
          <TextInput
            value={closureCard}
            onChangeText={(value) => setClosureCard(maskMoneyBr(value))}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Outros</Text>
          <TextInput
            value={closureOther}
            onChangeText={(value) => setClosureOther(maskMoneyBr(value))}
            keyboardType="decimal-pad"
            style={styles.input}
          />

          <Text style={styles.label}>Observações</Text>
          <TextInput
            value={closureNotes}
            onChangeText={setClosureNotes}
            multiline
            style={[styles.input, styles.textarea]}
          />

          <View style={styles.totalBox}>
            <Text style={styles.totalLabel}>Total do culto</Text>
            <Text style={styles.totalValue}>{money(total)}</Text>
          </View>

          {closure?.status === "approved" ? (
            <EloState
              title="Fechamento concluído"
              description="Este culto já foi conferido e lançado no caixa."
              icon="CheckCircleIcon"
            />
          ) : (
            <View style={styles.formActions}>
              <EloActionButton
                label="Salvar rascunho"
                variant="secondary"
                loading={savingClosure}
                onPress={() => void saveClosure(false)}
              />
              <EloActionButton
                label="Enviar para segunda conferência"
                icon="ShieldCheckIcon"
                loading={savingClosure}
                onPress={() => void saveClosure(true)}
              />
            </View>
          )}
        </EloCard>
      </EloScreen>
    );
  }

  return (
    <EloScreen
      title="Financeiro"
      eyebrow="ELO • GESTÃO"
      subtitle="Entradas, saídas, contas, orçamento e fechamento de cultos em um ambiente restrito."
      onBack={onBack}
    >
      {loading ? (
        <View style={styles.loading}>
          <ActivityIndicator />
        </View>
      ) : (
        <>
          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Saldo total</Text>
            <Text style={styles.balanceValue}>
              {money(dashboard?.balance)}
            </Text>
            <Text style={styles.balanceSub}>
              Resultado do mês: {money(dashboard?.month_result)}
            </Text>
          </View>

          <View style={styles.metricGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Receitas do mês</Text>
              <Text style={styles.metricValue}>
                {money(dashboard?.month_income)}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Despesas do mês</Text>
              <Text style={styles.metricValue}>
                {money(dashboard?.month_expense)}
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>A pagar</Text>
              <Text style={styles.metricValue}>
                {money(dashboard?.payables)}
              </Text>
              <Text style={styles.metricMeta}>
                {dashboard?.payables_count ?? 0} conta(s)
              </Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>A receber</Text>
              <Text style={styles.metricValue}>
                {money(dashboard?.receivables)}
              </Text>
              <Text style={styles.metricMeta}>
                {dashboard?.receivables_count ?? 0} conta(s)
              </Text>
            </View>
          </View>

          {canManage ? (
            <View style={styles.quickActions}>
              <View style={styles.half}>
                <EloActionButton
                  label="Nova entrada"
                  icon="ArrowDownLeftIcon"
                  onPress={() => {
                    setTransactionKind("income");
                    setShowTransactionForm(true);
                  }}
                />
              </View>
              <View style={styles.half}>
                <EloActionButton
                  label="Nova saída"
                  variant="secondary"
                  icon="ArrowUpRightIcon"
                  onPress={() => {
                    setTransactionKind("expense");
                    setShowTransactionForm(true);
                  }}
                />
              </View>
            </View>
          ) : null}

          {showTransactionForm ? (
            <EloCard>
              <Text style={eloSharedStyles.cardTitle}>
                {transactionKind === "income"
                  ? "Nova entrada"
                  : "Nova saída"}
              </Text>

              <Text style={styles.label}>Categoria</Text>
              <View style={styles.choiceList}>
                {currentCategories.map((category) => (
                  <Pressable
                    key={category.category_id}
                    onPress={() =>
                      setSelectedCategoryId(category.category_id)
                    }
                    style={[
                      styles.option,
                      selectedCategoryId === category.category_id &&
                        styles.optionSelected,
                    ]}
                  >
                    <Text style={styles.optionText}>
                      {category.category_name}
                    </Text>
                    {selectedCategoryId === category.category_id ? (
                      <P.CheckCircleIcon
                        size={17}
                        color={eloColors.blue}
                        weight="fill"
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Conta</Text>
              <View style={styles.choiceList}>
                {activeAccounts.map((account) => (
                  <Pressable
                    key={account.account_id}
                    onPress={() =>
                      setSelectedAccountId(account.account_id)
                    }
                    style={[
                      styles.option,
                      selectedAccountId === account.account_id &&
                        styles.optionSelected,
                    ]}
                  >
                    <View style={styles.grow}>
                      <Text style={styles.optionText}>
                        {account.account_name}
                      </Text>
                      <Text style={styles.optionMeta}>
                        Saldo {money(account.current_balance)}
                      </Text>
                    </View>
                    {selectedAccountId === account.account_id ? (
                      <P.CheckCircleIcon
                        size={17}
                        color={eloColors.blue}
                        weight="fill"
                      />
                    ) : null}
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Descrição</Text>
              <TextInput
                value={transactionDescription}
                onChangeText={setTransactionDescription}
                placeholder="Ex.: Conta de energia"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />

              <Text style={styles.label}>Valor</Text>
              <MoneyCalculatorInput
                value={transactionAmount}
                onChange={setTransactionAmount}
              />

              <Text style={styles.label}>Data</Text>
              <TextInput
                value={transactionDate}
                onChangeText={(value) =>
                  setTransactionDate(maskDateBr(value))
                }
                placeholder="dd/mm/aaaa"
                placeholderTextColor="#A1A9B0"
                keyboardType="number-pad"
                maxLength={10}
                style={styles.input}
              />

              <Text style={styles.label}>Situação</Text>
              <View style={styles.twoColumns}>
                <Pressable
                  onPress={() => setTransactionStatus("paid")}
                  style={[
                    styles.choice,
                    transactionStatus === "paid" &&
                      styles.optionSelected,
                  ]}
                >
                  <Text style={styles.choiceTitle}>Pago</Text>
                </Pressable>
                <Pressable
                  onPress={() => setTransactionStatus("pending")}
                  style={[
                    styles.choice,
                    transactionStatus === "pending" &&
                      styles.optionSelected,
                  ]}
                >
                  <Text style={styles.choiceTitle}>
                    {transactionKind === "income"
                      ? "A receber"
                      : "A pagar"}
                  </Text>
                </Pressable>
              </View>

              {transactionStatus === "pending" ? (
                <>
                  <Text style={styles.label}>Vencimento</Text>
                  <TextInput
                    value={transactionDueDate}
                    onChangeText={(value) =>
                      setTransactionDueDate(maskDateBr(value))
                    }
                    placeholder="dd/mm/aaaa"
                    placeholderTextColor="#A1A9B0"
                    keyboardType="number-pad"
                    maxLength={10}
                    style={styles.input}
                  />
                </>
              ) : (
                <>
                  <Text style={styles.label}>Forma de pagamento</Text>
                  <View style={styles.wrapChoices}>
                    {[
                      ["pix", "PIX"],
                      ["cash", "Dinheiro"],
                      ["card", "Cartão"],
                      ["transfer", "Transferência"],
                      ["boleto", "Boleto"],
                      ["other", "Outro"],
                    ].map(([value, label]) => (
                      <Pressable
                        key={value}
                        onPress={() => setPaymentMethod(value)}
                        style={[
                          styles.smallChoice,
                          paymentMethod === value &&
                            styles.optionSelected,
                        ]}
                      >
                        <Text style={styles.smallChoiceText}>
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.formActions}>
                <EloActionButton
                  label="Salvar lançamento"
                  icon="CheckIcon"
                  loading={savingTransaction}
                  onPress={() => void saveTransaction()}
                />
                <EloActionButton
                  label="Cancelar"
                  variant="secondary"
                  onPress={() => setShowTransactionForm(false)}
                />
              </View>
            </EloCard>
          ) : null}

          <Text style={eloSharedStyles.sectionTitle}>
            Contas a vencer
          </Text>

          {pendingTransactions.length === 0 ? (
            <EloState
              title="Nada pendente"
              description="Contas a pagar e a receber aparecerão aqui."
              icon="CheckCircleIcon"
            />
          ) : (
            <View style={styles.list}>
              {pendingTransactions.slice(0, 10).map((item) => (
                <EloCard key={item.transaction_id}>
                  <View style={styles.transactionRow}>
                    <View style={styles.transactionIcon}>
                      {item.kind === "income" ? (
                        <P.ArrowDownLeftIcon
                          size={19}
                          color={eloColors.green}
                          weight="bold"
                        />
                      ) : (
                        <P.ArrowUpRightIcon
                          size={19}
                          color={eloColors.danger}
                          weight="bold"
                        />
                      )}
                    </View>
                    <View style={styles.grow}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {item.description}
                      </Text>
                      <Text style={styles.transactionMeta}>
                        {item.category_name} • vence{" "}
                        {formatDate(item.due_on)}
                      </Text>
                    </View>
                    <Text style={styles.transactionAmount}>
                      {money(item.amount)}
                    </Text>
                  </View>

                  {canManage ? (
                    <View style={styles.pendingAction}>
                      <EloActionButton
                        label={
                          item.kind === "income"
                            ? "Marcar como recebido"
                            : "Marcar como pago"
                        }
                        variant="secondary"
                        icon="CheckIcon"
                        onPress={() => void markPaid(item)}
                      />
                    </View>
                  ) : null}
                </EloCard>
              ))}
            </View>
          )}

          <Text style={eloSharedStyles.sectionTitle}>
            Fechamento de cultos
          </Text>

          {dashboard?.pending_closures ? (
            <View style={styles.warningBox}>
              <P.WarningCircleIcon
                size={18}
                color="#9A5B00"
                weight="duotone"
              />
              <Text style={styles.warningText}>
                {dashboard.pending_closures} fechamento(s) aguardando segunda conferência.
              </Text>
            </View>
          ) : null}

          <View style={styles.list}>
            {services.slice(0, 8).map((service) => (
              <EloCard key={service.event_id}>
                <View style={styles.serviceRow}>
                  <View style={styles.serviceIcon}>
                    <P.CalendarCheckIcon
                      size={19}
                      color={eloColors.blue}
                      weight="duotone"
                    />
                  </View>
                  <View style={styles.grow}>
                    <Text style={eloSharedStyles.cardTitle}>
                      {service.event_title}
                    </Text>
                    <Text style={styles.transactionMeta}>
                      {formatDateTime(service.starts_at)}
                    </Text>
                    <Text style={styles.closureStatusSmall}>
                      {closureStatusLabel(service.closure_status)}
                      {service.total_amount != null
                        ? ` • ${money(service.total_amount)}`
                        : ""}
                    </Text>
                  </View>
                </View>

                {canManage ? (
                  <View style={styles.serviceActions}>
                    <View style={styles.half}>
                      <EloActionButton
                        label={
                          service.closure_status
                            ? "Abrir fechamento"
                            : "Fechar culto"
                        }
                        variant="secondary"
                        onPress={() => void openClosure(service)}
                      />
                    </View>

                    {service.closure_status === "submitted" &&
                    service.closure_id ? (
                      <View style={styles.half}>
                        <EloActionButton
                          label="Conferir e aprovar"
                          icon="ShieldCheckIcon"
                          loading={
                            approvingClosureId === service.closure_id
                          }
                          onPress={() => void approveClosure(service)}
                        />
                      </View>
                    ) : null}
                  </View>
                ) : null}
              </EloCard>
            ))}
          </View>

          <Text style={eloSharedStyles.sectionTitle}>
            Orçamento do mês
          </Text>

          {canManage ? (
            <View style={styles.sectionAction}>
              <EloActionButton
                label={
                  showBudgetForm
                    ? "Fechar orçamento"
                    : "Definir orçamento"
                }
                variant="secondary"
                icon={showBudgetForm ? "XIcon" : "PlusIcon"}
                onPress={() => setShowBudgetForm((value) => !value)}
              />
            </View>
          ) : null}

          {showBudgetForm ? (
            <EloCard>
              <Text style={eloSharedStyles.cardTitle}>
                Limite por categoria
              </Text>

              <View style={styles.choiceList}>
                {expenseCategories.map((category) => (
                  <Pressable
                    key={category.category_id}
                    onPress={() =>
                      setBudgetCategoryId(category.category_id)
                    }
                    style={[
                      styles.option,
                      budgetCategoryId === category.category_id &&
                        styles.optionSelected,
                    ]}
                  >
                    <Text style={styles.optionText}>
                      {category.category_name}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Text style={styles.label}>Valor planejado</Text>
              <TextInput
                value={budgetAmount}
                onChangeText={(value) => setBudgetAmount(maskMoneyBr(value))}
                keyboardType="decimal-pad"
                placeholder="0,00"
                placeholderTextColor="#A1A9B0"
                style={styles.input}
              />

              <View style={styles.formActions}>
                <EloActionButton
                  label="Salvar orçamento"
                  loading={savingBudget}
                  onPress={() => void saveBudget()}
                />
              </View>
            </EloCard>
          ) : null}

          <View style={styles.list}>
            {budgets
              .filter(
                (item) =>
                  Number(item.planned_amount) > 0 ||
                  Number(item.actual_amount) > 0
              )
              .map((item) => (
                <EloCard key={item.category_id}>
                  <View style={styles.budgetRow}>
                    <View style={styles.grow}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {item.category_name}
                      </Text>
                      <Text style={styles.transactionMeta}>
                        Gasto {money(item.actual_amount)} de{" "}
                        {money(item.planned_amount)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.remainingValue,
                        Number(item.remaining_amount) < 0 &&
                          styles.negative,
                      ]}
                    >
                      {money(item.remaining_amount)}
                    </Text>
                  </View>
                </EloCard>
              ))}
          </View>

          <Text style={eloSharedStyles.sectionTitle}>
            Movimentações recentes
          </Text>

          {recentTransactions.length === 0 ? (
            <EloState
              title="Nenhum lançamento ainda"
              description="As entradas e saídas aparecerão aqui."
              icon="WalletIcon"
            />
          ) : (
            <View style={styles.list}>
              {recentTransactions.map((item) => (
                <EloCard key={item.transaction_id}>
                  <View style={styles.transactionRow}>
                    <View style={styles.transactionIcon}>
                      {item.kind === "income" ? (
                        <P.ArrowDownLeftIcon
                          size={18}
                          color={eloColors.green}
                          weight="bold"
                        />
                      ) : (
                        <P.ArrowUpRightIcon
                          size={18}
                          color={eloColors.danger}
                          weight="bold"
                        />
                      )}
                    </View>
                    <View style={styles.grow}>
                      <Text style={eloSharedStyles.cardTitle}>
                        {item.description}
                      </Text>
                      <Text style={styles.transactionMeta}>
                        {item.category_name} •{" "}
                        {formatDate(item.occurred_on)}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.transactionAmount,
                        item.kind === "expense" && styles.negative,
                      ]}
                    >
                      {item.kind === "expense" ? "−" : "+"}
                      {money(item.amount)}
                    </Text>
                  </View>
                </EloCard>
              ))}
            </View>
          )}

          {canManage ? (
            <>
              <Text style={eloSharedStyles.sectionTitle}>
                Contas e categorias
              </Text>

              <View style={styles.sectionAction}>
                <EloActionButton
                  label={
                    showStructure
                      ? "Fechar estrutura"
                      : "Configurar estrutura financeira"
                  }
                  variant="secondary"
                  icon={showStructure ? "XIcon" : "GearIcon"}
                  onPress={() => setShowStructure((value) => !value)}
                />
              </View>

              {showStructure ? (
                <>
                  <EloCard>
                    <Text style={eloSharedStyles.cardTitle}>
                      Contas
                    </Text>

                    {accounts.map((account) => (
                      <View
                        key={account.account_id}
                        style={styles.structureRow}
                      >
                        <View style={styles.grow}>
                          <Text style={styles.optionText}>
                            {account.account_name}
                          </Text>
                          <Text style={styles.optionMeta}>
                            {account.account_type} •{" "}
                            {money(account.current_balance)}
                          </Text>
                        </View>
                      </View>
                    ))}

                    <Text style={styles.label}>Nova conta</Text>
                    <TextInput
                      value={accountName}
                      onChangeText={setAccountName}
                      placeholder="Ex.: Banco principal"
                      placeholderTextColor="#A1A9B0"
                      style={styles.input}
                    />

                    <View style={styles.wrapChoices}>
                      {[
                        ["bank", "Banco"],
                        ["cash", "Caixa"],
                        ["wallet", "Carteira"],
                      ].map(([value, label]) => (
                        <Pressable
                          key={value}
                          onPress={() =>
                            setAccountType(
                              value as "cash" | "bank" | "wallet"
                            )
                          }
                          style={[
                            styles.smallChoice,
                            accountType === value &&
                              styles.optionSelected,
                          ]}
                        >
                          <Text style={styles.smallChoiceText}>
                            {label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={styles.label}>Saldo inicial</Text>
                    <TextInput
                      value={accountOpeningBalance}
                      onChangeText={(value) => setAccountOpeningBalance(maskMoneyBr(value))}
                      keyboardType="decimal-pad"
                      placeholder="0,00"
                      placeholderTextColor="#A1A9B0"
                      style={styles.input}
                    />

                    <View style={styles.formActions}>
                      <EloActionButton
                        label="Adicionar conta"
                        loading={savingStructure}
                        onPress={() => void saveAccount()}
                      />
                    </View>
                  </EloCard>

                  <EloCard>
                    <Text style={eloSharedStyles.cardTitle}>
                      Categorias
                    </Text>

                    <Text style={styles.label}>Nova categoria</Text>
                    <View style={styles.twoColumns}>
                      <Pressable
                        onPress={() => setCategoryKind("income")}
                        style={[
                          styles.choice,
                          categoryKind === "income" &&
                            styles.optionSelected,
                        ]}
                      >
                        <Text style={styles.choiceTitle}>Receita</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => setCategoryKind("expense")}
                        style={[
                          styles.choice,
                          categoryKind === "expense" &&
                            styles.optionSelected,
                        ]}
                      >
                        <Text style={styles.choiceTitle}>Despesa</Text>
                      </Pressable>
                    </View>

                    <TextInput
                      value={categoryName}
                      onChangeText={setCategoryName}
                      placeholder="Ex.: Material de EBD"
                      placeholderTextColor="#A1A9B0"
                      style={[styles.input, styles.topGap]}
                    />

                    <View style={styles.formActions}>
                      <EloActionButton
                        label="Adicionar categoria"
                        loading={savingStructure}
                        onPress={() => void saveCategory()}
                      />
                    </View>
                  </EloCard>
                </>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </EloScreen>
  );
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: 44,
    alignItems: "center",
  },
  balanceCard: {
    marginTop: 20,
    padding: 18,
    borderRadius: 20,
    backgroundColor: eloColors.ink,
  },
  balanceLabel: {
    fontSize: 11,
    fontWeight: "800",
    color: "#DCE3E8",
  },
  balanceValue: {
    marginTop: 5,
    fontSize: 28,
    fontWeight: "900",
    color: "#FFFFFF",
  },
  balanceSub: {
    marginTop: 6,
    fontSize: 10,
    color: "#CAD3DA",
  },
  metricGrid: {
    marginTop: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metricCard: {
    flexGrow: 1,
    flexBasis: 145,
    minHeight: 86,
    padding: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
  },
  metricLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  metricValue: {
    marginTop: 6,
    fontSize: 16,
    fontWeight: "900",
    color: eloColors.ink,
  },
  metricMeta: {
    marginTop: 3,
    fontSize: 9,
    color: eloColors.muted,
  },
  quickActions: {
    marginTop: 12,
    flexDirection: "row",
    gap: 8,
  },
  half: {
    flex: 1,
  },
  label: {
    marginTop: 15,
    marginBottom: 6,
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.muted,
  },
  input: {
    minHeight: 48,
    paddingHorizontal: 13,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
    fontSize: 14,
    color: eloColors.ink,
  },
  moneyInputWrap: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 13,
    backgroundColor: "#FFFFFF",
  },
  moneyInput: {
    flex: 1,
    minHeight: 48,
    paddingHorizontal: 13,
    fontSize: 16,
    fontWeight: "800",
    color: eloColors.ink,
  },
  calculatorTrigger: {
    width: 50,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderLeftWidth: 1,
    borderLeftColor: eloColors.line,
    backgroundColor: "#F4F9FC",
  },
  calculatorPressed: {
    opacity: 0.72,
  },
  calculatorBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    padding: 14,
    backgroundColor: "rgba(11, 18, 24, 0.48)",
  },
  calculatorCard: {
    padding: 16,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
  },
  calculatorTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  calculatorEyebrow: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.2,
    color: eloColors.blue,
  },
  calculatorHint: {
    marginTop: 4,
    maxWidth: 260,
    fontSize: 10,
    lineHeight: 15,
    color: eloColors.muted,
  },
  calculatorClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: eloColors.surfaceSoft,
  },
  calculatorDisplay: {
    minHeight: 82,
    marginTop: 14,
    marginBottom: 12,
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "flex-end",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: "#F3F6F8",
  },
  calculatorCurrency: {
    paddingBottom: 4,
    fontSize: 13,
    fontWeight: "900",
    color: eloColors.muted,
  },
  calculatorDisplayText: {
    flexShrink: 1,
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "900",
    textAlign: "right",
    color: eloColors.ink,
  },
  calculatorGrid: {
    marginBottom: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  calculatorKey: {
    flexBasis: "22%",
    flexGrow: 1,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    backgroundColor: "#F3F6F8",
  },
  calculatorKeyWide: {
    flexBasis: "48%",
  },
  calculatorKeyOperation: {
    backgroundColor: "#EAF5FB",
  },
  calculatorKeyText: {
    fontSize: 18,
    fontWeight: "900",
    color: eloColors.ink,
  },
  calculatorKeyTextOperation: {
    color: eloColors.blue,
  },
  textarea: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: "top",
  },
  choiceList: {
    gap: 7,
  },
  option: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  optionSelected: {
    borderColor: "#8CC5E8",
    backgroundColor: "#F2F9FD",
  },
  optionText: {
    fontSize: 11,
    fontWeight: "800",
    color: eloColors.ink,
  },
  optionMeta: {
    marginTop: 3,
    fontSize: 9,
    color: eloColors.muted,
  },
  twoColumns: {
    flexDirection: "row",
    gap: 8,
  },
  choice: {
    flex: 1,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
  },
  choiceTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  wrapChoices: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
  },
  smallChoice: {
    minHeight: 38,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: eloColors.line,
    borderRadius: 11,
    backgroundColor: "#FFFFFF",
  },
  smallChoiceText: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.ink,
  },
  formActions: {
    marginTop: 16,
    gap: 8,
  },
  list: {
    gap: 9,
  },
  transactionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  transactionIcon: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "#F3F6F8",
  },
  grow: {
    flex: 1,
  },
  transactionMeta: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.muted,
  },
  transactionAmount: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.green,
  },
  negative: {
    color: eloColors.danger,
  },
  pendingAction: {
    marginTop: 12,
  },
  warningBox: {
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 11,
    borderRadius: 13,
    backgroundColor: "#FFF3D9",
  },
  warningText: {
    flex: 1,
    fontSize: 10,
    color: "#815A1B",
  },
  serviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  serviceIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    backgroundColor: eloColors.surfaceSoft,
  },
  closureStatusSmall: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: "800",
    color: eloColors.blue,
  },
  serviceActions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  sectionAction: {
    marginBottom: 10,
  },
  budgetRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  remainingValue: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.green,
  },
  structureRow: {
    minHeight: 48,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: eloColors.line,
  },
  topGap: {
    marginTop: 10,
  },
  closureContext: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#EAF5FB",
  },
  closureDate: {
    fontSize: 11,
    fontWeight: "900",
    color: eloColors.ink,
  },
  closureStatus: {
    marginTop: 3,
    fontSize: 10,
    color: eloColors.blue,
  },
  totalBox: {
    marginTop: 16,
    padding: 14,
    borderRadius: 14,
    backgroundColor: "#F3F6F8",
  },
  totalLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: eloColors.muted,
  },
  totalValue: {
    marginTop: 4,
    fontSize: 22,
    fontWeight: "900",
    color: eloColors.ink,
  },
});
