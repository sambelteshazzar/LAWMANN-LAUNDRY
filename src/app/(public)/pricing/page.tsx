import { TARIFF_ROWS, PIECES } from '@/lib/pricing';
import { money } from '@/lib/money';
import { Kicker, PillLink, PublicPage, Section } from '@/components/public';

export const metadata = { title: 'Prices' };

export default function PricingPage() {
  return (
    <PublicPage>
      <Section>
        <Kicker>Transparent pricing</Kicker>
        <h1 className="mt-3 font-display text-4xl font-bold tracking-tight text-forest md:text-6xl">
          Straight from the <span className="italic">shop tariff</span>
        </h1>
        <p className="mt-4 max-w-lg text-lg text-forest/70">
          Every bag goes on the scale and the price follows the kilo. No guesswork, no surprises.
        </p>

        <div className="mt-12 grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl bg-white p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-forest">By the kilo</h2>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-stoneline text-left text-xs font-semibold uppercase tracking-widest text-forest/50">
                  <th scope="col" className="py-2">Bag weight</th>
                  <th scope="col" className="py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {TARIFF_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-stoneline/60 last:border-none">
                    <td className="py-3 font-medium text-forest/80">{row.label}</td>
                    <td className="py-3 text-right font-display text-lg font-bold tabular-nums text-forest">
                      {money(row.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="rounded-3xl bg-white p-6 shadow-soft sm:p-8">
            <h2 className="font-display text-2xl font-semibold text-forest">By the piece</h2>
            <table className="mt-4 w-full text-sm">
              <thead>
                <tr className="border-b border-stoneline text-left text-xs font-semibold uppercase tracking-widest text-forest/50">
                  <th scope="col" className="py-2">Item</th>
                  <th scope="col" className="py-2 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {PIECES.map((piece) => (
                  <tr key={piece.code} className="border-b border-stoneline/60 last:border-none">
                    <td className="py-3 font-medium text-forest/80">
                      {piece.name}
                      {piece.mayBeDryClean ? (
                        <span className="ml-2 rounded-full bg-clay-soft px-2 py-0.5 text-xs font-semibold text-forest/70">
                          dry clean
                        </span>
                      ) : null}
                    </td>
                    <td className="py-3 text-right font-display text-lg font-bold tabular-nums text-forest">
                      {money(piece.price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <p className="mt-8 max-w-xl rounded-3xl bg-clay-soft p-6 text-sm leading-relaxed text-forest/80">
          Read the scale to the tenth: a bag between two bands, like 3.5kg, prices at the
          band below it plus GH¢5. Bags above 15.9kg: message us. Heavier bags are priced
          on the spot, never guessed.
        </p>
        <div className="mt-8">
          <PillLink href="/">Back to the front page</PillLink>
        </div>
      </Section>
    </PublicPage>
  );
}
