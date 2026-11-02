import { useState } from "react";
import {
  GOODS,
  GOOD_INFO,
  type Bundle,
  type CityId,
  type Good,
  type PrivateCity,
  type Projection,
  type TradeOffer,
} from "@cs/idle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { bundleIcon, bundleName, COIN } from "../format";
import { CostChips, Section } from "../ui";
import type { Run } from "./BuildPanel";

const AMOUNTS = [1, 5, 10];

export function MarketPanel({
  game,
  city,
  run,
}: {
  game: Projection;
  city: PrivateCity;
  run: Run;
}) {
  const [amount, setAmount] = useState(5);
  const live = game.phase === "running";
  return (
    <div className="space-y-3">
      <p className="text-sm leading-6 text-muted-foreground">
        Buy what you're missing, sell what you have too much of. Prices go up
        when the market runs low.
      </p>
      <div
        className="flex items-center gap-2"
        role="radiogroup"
        aria-label="How many"
      >
        <span className="text-xs font-semibold text-muted-foreground">
          How many:
        </span>
        {AMOUNTS.map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={amount === n}
            onClick={() => setAmount(n)}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-bold",
              amount === n
                ? "bg-primary text-primary-foreground"
                : "bg-secondary",
            )}
          >
            {n}
          </button>
        ))}
      </div>
      <ul className="space-y-2">
        {GOODS.map((good) => {
          const price = game.market[good];
          const info = GOOD_INFO[good];
          return (
            <li key={good} className="rounded-lg border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">
                  <span aria-hidden="true">{info.icon}</span> {info.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  You have {Math.floor(city.goods[good])} · Market has{" "}
                  {price.stock}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">{info.use}</p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={!live}
                  onClick={() =>
                    run(
                      { type: "marketBuy", payload: { good, amount } },
                      `Bought ${amount} ${info.name.toLowerCase()}.`,
                    )
                  }
                >
                  Buy · {price.buy * amount} {COIN}
                </Button>
                <Button
                  variant="outline"
                  className="h-9"
                  disabled={!live}
                  onClick={() =>
                    run(
                      { type: "marketSell", payload: { good, amount } },
                      `Sold ${amount} ${info.name.toLowerCase()}.`,
                    )
                  }
                >
                  Sell · {price.sell * amount} {COIN}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const KEYS: (Good | "coins")[] = ["coins", ...GOODS];

function BundleInputs({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Bundle;
  onChange: (next: Bundle) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-bold text-muted-foreground">
        {label}
      </legend>
      <div className="grid grid-cols-5 gap-1">
        {KEYS.map((key) => (
          <label
            key={key}
            className="flex flex-col items-center gap-0.5 text-xs"
          >
            <span aria-hidden="true">{bundleIcon(key)}</span>
            <span className="sr-only">{bundleName(key)}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={999}
              value={value[key] ?? ""}
              placeholder="0"
              onChange={(event) => {
                const n = Math.max(
                  0,
                  Math.floor(Number(event.target.value) || 0),
                );
                onChange({ ...value, [key]: n || undefined });
              }}
              className="h-8 w-full rounded-md border bg-background px-1 text-center tabular-nums"
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function OfferRow({
  offer,
  game,
  mine,
  run,
}: {
  offer: TradeOffer;
  game: Projection;
  mine: boolean;
  run: Run;
}) {
  const other = game.cities.find(
    (c) => c.id === (mine ? offer.to : offer.from),
  );
  const live = game.phase === "running";
  return (
    <li className="rounded-lg border p-2.5 text-sm">
      <p className="flex items-center gap-1.5 font-semibold">
        <span
          className="size-2.5 rounded-full"
          style={{ background: other?.color }}
        />
        {mine ? `To ${other?.name}` : `From ${other?.name}`}
        {offer.status !== "open" ? (
          <span className="ml-auto text-xs font-medium text-muted-foreground">
            {offer.status}
          </span>
        ) : null}
      </p>
      <div className="mt-1.5 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 text-xs">
        <span className="text-muted-foreground">
          {mine ? "You give" : "You get"}
        </span>
        <CostChips cost={offer.give} />
        <span className="text-muted-foreground">
          {mine ? "You get" : "You give"}
        </span>
        <CostChips cost={offer.get} />
      </div>
      {offer.status === "open" ? (
        <div className="mt-2 flex gap-2">
          {mine ? (
            <Button
              variant="outline"
              className="h-8 flex-1"
              disabled={!live}
              onClick={() =>
                run({ type: "cancelTrade", payload: { offerId: offer.id } })
              }
            >
              Cancel
            </Button>
          ) : (
            <>
              <Button
                className="h-8 flex-1"
                disabled={!live}
                onClick={() =>
                  run(
                    { type: "acceptTrade", payload: { offerId: offer.id } },
                    "Trade done! 🤝",
                  )
                }
              >
                Accept
              </Button>
              <Button
                variant="outline"
                className="h-8 flex-1"
                disabled={!live}
                onClick={() =>
                  run({ type: "declineTrade", payload: { offerId: offer.id } })
                }
              >
                No thanks
              </Button>
            </>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function TradePanel({
  game,
  city,
  run,
}: {
  game: Projection;
  city: PrivateCity;
  run: Run;
}) {
  const others = game.cities.filter((c) => c.id !== city.id);
  const [to, setTo] = useState<CityId | "">(others[0]?.id ?? "");
  const [give, setGive] = useState<Bundle>({});
  const [get, setGet] = useState<Bundle>({});
  const incoming = game.offers.filter(
    (o) => o.to === city.id && o.status === "open",
  );
  const outgoing = game.offers.filter(
    (o) => o.from === city.id && o.status === "open",
  );
  const recent = game.offers
    .filter((o) => o.status !== "open")
    .slice(-4)
    .reverse();

  return (
    <div className="space-y-5">
      <Section title={`Offers for you (${incoming.length})`}>
        {incoming.length ? (
          <ul className="space-y-2">
            {incoming.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                game={game}
                mine={false}
                run={run}
              />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            No offers right now. Other cities can't see what you have, so talk
            to them!
          </p>
        )}
      </Section>

      <Section title="Make an offer">
        <form
          className="space-y-3 rounded-lg border p-2.5"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!to) return;
            const sent = await run(
              { type: "proposeTrade", payload: { to, give, get } },
              "Offer sent!",
            );
            if (sent) {
              setGive({});
              setGet({});
            }
          }}
        >
          <label className="flex items-center gap-2 text-sm font-semibold">
            To
            <select
              value={to}
              onChange={(event) => setTo(event.target.value as CityId)}
              className="h-8 flex-1 rounded-md border bg-background px-2"
            >
              {others.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <BundleInputs label="You give" value={give} onChange={setGive} />
          <BundleInputs label="You want" value={get} onChange={setGet} />
          <Button
            type="submit"
            className="w-full"
            disabled={game.phase !== "running" || !to}
          >
            Send offer
          </Button>
        </form>
      </Section>

      {outgoing.length ? (
        <Section title="Your offers">
          <ul className="space-y-2">
            {outgoing.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                game={game}
                mine
                run={run}
              />
            ))}
          </ul>
        </Section>
      ) : null}

      {recent.length ? (
        <Section title="Recent">
          <ul className="space-y-2">
            {recent.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                game={game}
                mine={offer.from === city.id}
                run={run}
              />
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
