import Link from 'next/link';
import { BANDS, PIECES } from '@/lib/pricing';
import { money } from '@/lib/money';
import { PublicPage } from '@/components/public';

export const metadata = { title: 'Prices' };

export default function PricingPage() {
  return (
    <PublicPage>
      <section className="pb-12 pt-8 md:pt-14">
        <h1 className="text-3xl font-extrabold text-stone-900 md:text-4xl">Prices</h1>
        <p className="mt-2 text-stone-600">
          Straight from the shop tariff. Every bag goes on the scale and the price follows the kilo.
        </p>

        <h2 className="mt-10 text-xl font-bold text-stone-900">By the kilo</h2>
        <table className="mt-3 w-full max-w-md text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th scope="col" className="py-2 font-semibold">Bag weight</th>
              <th scope="col" className="py-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {BANDS.map((band) => (
              <tr key={band.to} className="border-b border-stone-100">
                <td className="py-3 text-stone-800">Up to {band.to / 1000}kg</td>
                <td className="py-3 text-right font-bold tabular-nums text-stone-900">{money(band.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-10 text-xl font-bold text-stone-900">By the piece</h2>
        <table className="mt-3 w-full max-w-md text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th scope="col" className="py-2 font-semibold">Item</th>
              <th scope="col" className="py-2 text-right font-semibold">Price</th>
            </tr>
          </thead>
          <tbody>
            {PIECES.map((piece) => (
              <tr key={piece.code} className="border-b border-stone-100">
                <td className="py-3 text-stone-800">
                  {piece.name}
                  {piece.mayBeDryClean ? (
                    <span className="ml-2 rounded bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-stone-600">
                      dry clean
                    </span>
                  ) : null}
                </td>
                <td className="py-3 text-right font-bold tabular-nums text-stone-900">{money(piece.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 rounded-lg bg-stone-100 p-4">
          <p className="text-sm text-stone-700">
            Bags above 15kg: message us. The tariff stops at 15kg, so heavier bags are priced on the spot, never guessed.
          </p>
        </div>
        <Link href="/" className="mt-6 inline-flex min-h-12 items-center text-sm font-semibold text-teal-800 underline">
          Back to the front page
        </Link>
      </section>
    </PublicPage>
  );
}
