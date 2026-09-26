export function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function maskDateBr(value: string) {
  const digits = onlyDigits(value).slice(0, 8);

  if (digits.length <= 2) {
    return digits;
  }

  if (digits.length <= 4) {
    return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  }

  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function parseDateBrToIso(value: string) {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, dd, mm, yyyy] = match;
  const day = Number(dd);
  const month = Number(mm);
  const year = Number(yyyy);

  if (year < 1900 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return `${yyyy}-${mm}-${dd}`;
}

export function maskPhoneBr(value: string) {
  const digits = onlyDigits(value).slice(0, 11);

  if (!digits) {
    return "";
  }

  if (digits.length <= 2) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  }

  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }

  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function maskMoneyBr(value: string) {
  const raw = value.replace(/[^\d.,]/g, "");

  if (!raw) {
    return "";
  }

  const commaIndex = raw.lastIndexOf(",");
  const dotIndex = raw.lastIndexOf(".");
  let separatorIndex = -1;

  if (commaIndex >= 0) {
    separatorIndex = commaIndex;
  } else if (dotIndex >= 0) {
    const decimalsAfterDot = raw.length - dotIndex - 1;
    separatorIndex = decimalsAfterDot <= 2 ? dotIndex : -1;
  }

  const integerDigits = onlyDigits(
    separatorIndex >= 0 ? raw.slice(0, separatorIndex) : raw
  ).replace(/^0+(?=\d)/, "");

  const integerPart = integerDigits || "0";

  if (separatorIndex < 0) {
    return integerPart;
  }

  const decimalPart = onlyDigits(raw.slice(separatorIndex + 1)).slice(0, 2);

  return `${integerPart},${decimalPart}`;
}

export function parseMoneyBr(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  if (!normalized) {
    return 0;
  }

  return Number(normalized);
}

export function formatMoneyInputBr(
  value: number | string | null | undefined
) {
  const number = Number(value ?? 0);

  if (!Number.isFinite(number)) {
    return "0,00";
  }

  return number.toFixed(2).replace(".", ",");
}
