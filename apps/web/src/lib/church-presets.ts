// Os mesmos presets do aplicativo Android, base para a personalização web.
// Chaves e nomes devem manter compatibilidade com get_church_structure no banco.
export type SchedulePreset = { name: string; required_count: number };
export type DepartmentPreset = {
  key: string;
  name: string;
  category: string;
  functions: SchedulePreset[];
};
export type Ministry = { key: string; name: string };

export const DEPARTMENT_PRESETS: DepartmentPreset[] = [
  { key: "louvor", name: "Louvor e adoração", category: "Cultos", functions: [
    { name: "Voz", required_count: 4 }, { name: "Bateria", required_count: 1 },
    { name: "Teclado", required_count: 1 }, { name: "Violão", required_count: 1 },
  ] },
  { key: "recepcao", name: "Recepção", category: "Cultos", functions: [
    { name: "Recepcionista", required_count: 2 }, { name: "Visitantes", required_count: 1 },
  ] },
  { key: "portaria", name: "Portaria", category: "Cultos", functions: [
    { name: "Porteiro", required_count: 2 },
  ] },
  { key: "intercessao", name: "Intercessão", category: "Cultos", functions: [
    { name: "Intercessor", required_count: 4 },
  ] },
  { key: "diaconato", name: "Diaconato", category: "Cultos", functions: [
    { name: "Apoio ao culto", required_count: 2 },
    { name: "Recolher ofertas", required_count: 2 },
    { name: "Maquininha", required_count: 1 },
  ] },
  { key: "santa_ceia", name: "Santa Ceia", category: "Cultos", functions: [
    { name: "Preparar a Ceia", required_count: 2 },
    { name: "Servir o pão", required_count: 2 },
    { name: "Servir o vinho", required_count: 2 },
  ] },
  { key: "midia", name: "Mídia e transmissão", category: "Cultos", functions: [
    { name: "Projeção", required_count: 2 },
    { name: "Fotografia", required_count: 2 },
    { name: "Transmissão", required_count: 1 },
  ] },
  { key: "sonoplastia", name: "Sonoplastia", category: "Cultos", functions: [
    { name: "Operador de áudio", required_count: 1 },
  ] },
  { key: "infantil", name: "Ministério infantil / Elo Kids", category: "Ensino", functions: [
    { name: "Professor", required_count: 1 },
    { name: "Auxiliar", required_count: 2 },
    { name: "Check-in e retirada", required_count: 1 },
  ] },
  { key: "ebd", name: "Escola Bíblica Dominical", category: "Ensino", functions: [
    { name: "Professor", required_count: 1 },
    { name: "Auxiliar", required_count: 1 },
  ] },
  { key: "jovens", name: "Jovens", category: "Ensino", functions: [
    { name: "Líder", required_count: 1 }, { name: "Apoio", required_count: 2 },
  ] },
  { key: "adolescentes", name: "Adolescentes", category: "Ensino", functions: [
    { name: "Líder", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "mulheres", name: "Mulheres / Círculo de oração", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 2 },
  ] },
  { key: "homens", name: "Homens", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "casais", name: "Casais e família", category: "Comunidade", functions: [
    { name: "Coordenação", required_count: 1 }, { name: "Apoio", required_count: 1 },
  ] },
  { key: "evangelismo", name: "Evangelismo", category: "Missão e cuidado", functions: [
    { name: "Evangelista", required_count: 2 },
  ] },
  { key: "missoes", name: "Missões", category: "Missão e cuidado", functions: [
    { name: "Equipe de missões", required_count: 2 },
  ] },
  { key: "acao_social", name: "Ação social", category: "Missão e cuidado", functions: [
    { name: "Acolhimento", required_count: 2 },
  ] },
  { key: "visitacao", name: "Visitação", category: "Missão e cuidado", functions: [
    { name: "Equipe de visitas", required_count: 2 },
  ] },
  { key: "estacionamento", name: "Estacionamento e segurança", category: "Apoio", functions: [
    { name: "Estacionamento", required_count: 1 },
    { name: "Segurança", required_count: 1 },
  ] },
  { key: "limpeza", name: "Limpeza e organização", category: "Apoio", functions: [
    { name: "Organização", required_count: 2 },
  ] },
  { key: "comunicacao", name: "Comunicação", category: "Apoio", functions: [
    { name: "Redes sociais", required_count: 1 },
    { name: "Divulgação", required_count: 1 },
  ] },
  { key: "eventos", name: "Eventos", category: "Apoio", functions: [
    { name: "Organização", required_count: 2 },
  ] },
  { key: "tesouraria", name: "Tesouraria", category: "Apoio", functions: [
    { name: "Contagem de ofertas", required_count: 2 },
  ] },
];

export const MINISTRY_PRESETS: Ministry[] = [
  { key: "pastor_presidente", name: "Pastor presidente" },
  { key: "pastor_titular", name: "Pastor titular / dirigente" },
  { key: "pastor_auxiliar", name: "Pastor auxiliar" },
  { key: "bispo", name: "Bispo" },
  { key: "apostolo", name: "Apóstolo" },
  { key: "missionario", name: "Missionário(a)" },
  { key: "evangelista", name: "Evangelista" },
  { key: "presbitero", name: "Presbítero" },
  { key: "diacono", name: "Diácono / diaconisa" },
  { key: "cooperador", name: "Cooperador(a)" },
  { key: "obreiro", name: "Obreiro(a)" },
  { key: "seminarista", name: "Seminarista" },
];

