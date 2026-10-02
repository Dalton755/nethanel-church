import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function bcbDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${month}-${day}-${year}`;
}

type BcbQuote = {
  cotacaoCompra?: number;
  cotacaoVenda?: number;
  dataHoraCotacao?: string;
};

export async function GET() {
  try {
    for (let offset = 0; offset < 8; offset += 1) {
      const date = new Date(Date.now() - offset * 24 * 60 * 60 * 1000);
      const queryDate = bcbDate(date);
      const url =
        "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/" +
        `CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${queryDate}'&$top=100&$format=json`;

      const response = await fetch(url, {
        next: { revalidate: 3600 },
        headers: { Accept: "application/json" },
      });

      if (!response.ok) continue;

      const payload = (await response.json()) as { value?: BcbQuote[] };
      const quotes = payload.value ?? [];
      const quote = quotes.at(-1);
      const rate = Number(quote?.cotacaoVenda ?? 0);

      if (Number.isFinite(rate) && rate > 0) {
        return NextResponse.json({
          pair: "USD/BRL",
          rate,
          rate_date: quote?.dataHoraCotacao ?? queryDate,
          source: "Banco Central do Brasil · PTAX venda",
        });
      }
    }

    return NextResponse.json(
      { error: "Cotação USD/BRL indisponível no Banco Central." },
      { status: 503 }
    );
  } catch {
    return NextResponse.json(
      { error: "Falha ao consultar a cotação USD/BRL." },
      { status: 503 }
    );
  }
}
