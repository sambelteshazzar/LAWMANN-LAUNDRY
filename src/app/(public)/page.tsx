import { BANDS } from '@/lib/pricing';
import { moneyShort } from '@/lib/money';
import { AREAS } from '@/lib/site';
import Image from 'next/image';
import {
  Badge,
  CallButton,
  Kicker,
  PillLink,
  PublicPage,
  Section,
  WhatsAppButton,
} from '@/components/public';
import {
  BanknoteIcon,
  ChatIcon,
  MapPinIcon,
  ReceiptIcon,
  ScaleIcon,
} from '@/components/icons';

export const metadata = { title: { absolute: 'Lawmann Laundry | Campus laundry at Legon' } };

const TRUST = [
  { icon: ScaleIcon, label: 'Weighed by the kilo' },
  { icon: ChatIcon, label: 'SMS at every step' },
  { icon: BanknoteIcon, label: 'MoMo or cash' },
  { icon: MapPinIcon, label: 'Campus pickup' },
];

const STEPS = [
  {
    title: 'Message us',
    body: 'Send a WhatsApp message or call to arrange your wash. Tell us your hall and we take it from there.',
  },
  {
    title: 'Weighed, not estimated',
    body: 'Your bag goes on the scale and the price follows the kilo, straight from the shop tariff.',
  },
  {
    title: 'Texted at every step',
    body: 'An SMS when your bag is accepted and another the moment it is ready for collection.',
  },
  {
    title: 'Pay your way',
    body: 'MoMo or cash at collection, with a receipt that splits every tax the GRA way.',
  },
];

const WHY = [
  {
    icon: ScaleIcon,
    title: 'Weighed by the kilo',
    body: 'The scale decides the price. Every bag is weighed and billed by the kilo, never guessed.',
  },
  {
    icon: ChatIcon,
    title: 'SMS at every step',
    body: 'A text when your bag is accepted and another the moment it is ready.',
  },
  {
    icon: ReceiptIcon,
    title: 'Receipts that add up',
    body: 'Every receipt splits VAT, NHIL and the GETFund levy, the GRA way.',
  },
  {
    icon: BanknoteIcon,
    title: 'MoMo or cash',
    body: 'Pay by mobile money or cash at collection, your choice.',
  },
];

export default function LandingPage() {
  return (
    <PublicPage>
      <section className="grid items-center gap-12 py-12 md:grid-cols-2 md:gap-16 md:py-24">
        <div className="rise">
          <Badge>Campus laundry at the University of Ghana</Badge>
          <h1 className="mt-6 font-display text-5xl font-bold leading-[1.05] tracking-tight text-forest sm:text-6xl lg:text-7xl">
            Your laundry, <span className="italic text-terracotta-deep">weighed</span> and{' '}
            <span className="italic text-terracotta-deep">washed</span>.
          </h1>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-forest/70">
            Lawmann washes by the kilo, not by estimate, and texts you at every step.
          </p>
          <p className="mt-3 text-sm font-semibold text-forest/60">
            Weighed on the scale · SMS updates included · MoMo or cash at collection
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <WhatsAppButton
              label="Book on WhatsApp"
              message="Hello Lawmann, I would like to book a laundry wash."
            />
            <PillLink href="/pricing">See prices</PillLink>
          </div>
        </div>
        <div className="relative mx-auto w-full max-w-md md:max-w-none">
          <figure className="relative aspect-[3/4] w-full overflow-hidden rounded-t-full border border-stoneline md:aspect-square md:h-[440px]">
            <Image
              src="/images/hero-laundry.jpg"
              alt="Washing machines inside a working laundromat"
              fill
              priority
              sizes="(min-width: 768px) 42vw, 90vw"
              className="object-cover transition-transform duration-700 hover:scale-105"
            />
          </figure>
          <div className="relative z-10 mx-auto -mt-14 w-[92%] rounded-3xl bg-white p-6 shadow-bloom md:ml-auto md:-mt-24 md:w-[88%] md:p-8">
            <h2 className="font-display text-xl font-semibold italic text-forest">
              As easy as 1-2-3
            </h2>
            <ol className="mt-4 space-y-3">
              {[
                'Message us on WhatsApp to arrange the pickup',
                'We weigh your bag and wash by the kilo',
                'We text you the moment it is ready',
              ].map((line, i) => (
                <li key={line} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-soft text-sm font-bold text-forest">
                    {i + 1}
                  </span>
                  <span className="text-sm leading-snug text-forest/80">{line}</span>
                </li>
              ))}
            </ol>
            <p className="mt-5 border-t border-stoneline pt-4 text-sm text-forest/70">
              Bags from{' '}
              <span className="font-display text-2xl font-bold text-forest">
                {moneyShort(BANDS[0]!.price)}
              </span>
            </p>
          </div>
        </div>
      </section>

      <div className="rounded-3xl bg-clay-soft px-6 py-8 sm:px-10">
        <ul className="grid grid-cols-2 gap-6 md:grid-cols-4 md:gap-8">
          {TRUST.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sage-soft">
                <Icon className="h-5 w-5 text-sage-deep" />
              </span>
              <span className="text-sm font-semibold leading-snug text-forest">{label}</span>
            </li>
          ))}
        </ul>
      </div>

      <Section>
        <Kicker>How it works</Kicker>
        <h2 className="mt-3 max-w-xl font-display text-4xl font-bold tracking-tight text-forest md:text-5xl">
          Laundry doesn't have to be <span className="italic">complicated</span>.
        </h2>
        <p className="mt-4 max-w-lg text-lg text-forest/70">
          From your hall door to the shop and back, with a text at every turn.
        </p>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="md:even:translate-y-12">
              <div className="h-full rounded-3xl bg-white p-8 shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-soft-md">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-soft font-display text-lg font-bold text-forest">
                  {i + 1}
                </span>
                <h3 className="mt-4 font-display text-2xl font-semibold text-forest">{step.title}</h3>
                <p className="mt-2 leading-relaxed text-forest/70">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="rounded-3xl bg-white p-8 shadow-soft md:flex md:items-center md:justify-between md:p-12">
          <div>
            <Kicker>Transparent pricing</Kicker>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-forest">
              Straight from the <span className="italic">shop tariff</span>
            </h2>
            <p className="mt-3 max-w-md text-forest/70">
              Every bag goes on the scale and the price follows the kilo. Or price single pieces
              from the same list.
            </p>
            <div className="mt-6">
              <PillLink href="/pricing">See the full price list</PillLink>
            </div>
          </div>
          <p className="mt-8 shrink-0 md:mt-0 md:text-right">
            <span className="block text-sm font-semibold uppercase tracking-widest text-forest/50">
              Bags from
            </span>
            <span className="font-display text-6xl font-bold tracking-tight text-forest md:text-7xl">
              {moneyShort(BANDS[0]!.price)}
            </span>
          </p>
        </div>
      </Section>

      <Section>
        <Kicker>Where we collect</Kicker>
        <h2 className="mt-3 font-display text-4xl font-bold tracking-tight text-forest md:text-5xl">
          Across the <span className="italic">Legon</span> campus
        </h2>
        <ul className="mt-8 flex flex-wrap gap-3">
          {AREAS.map((area) => (
            <li
              key={area}
              className="rounded-full bg-clay-soft px-4 py-2 text-sm font-medium text-forest transition-colors duration-300 hover:bg-clay"
            >
              {area}
            </li>
          ))}
        </ul>
      </Section>

      <Section>
        <Kicker>Why Lawmann</Kicker>
        <h2 className="mt-3 max-w-xl font-display text-4xl font-bold tracking-tight text-forest md:text-5xl">
          The scale and the <span className="italic">text</span>, every single time
        </h2>
        <ol className="mt-10 grid gap-6 sm:grid-cols-2 md:gap-8">
          {WHY.map(({ icon: Icon, title, body }) => (
            <li key={title} className="md:even:translate-y-12">
              <div className="h-full rounded-3xl bg-white p-8 shadow-soft transition-all duration-500 hover:-translate-y-2 hover:shadow-soft-md">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sage-soft">
                  <Icon className="h-5 w-5 text-sage-deep" />
                </span>
                <h3 className="mt-4 font-display text-2xl font-semibold text-forest">{title}</h3>
                <p className="mt-2 leading-relaxed text-forest/70">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section>
        <div className="rounded-[40px] bg-forest px-6 py-16 text-center md:py-24">
          <h2 className="mx-auto max-w-2xl font-display text-4xl font-bold tracking-tight text-alabaster md:text-5xl">
            Ready when <span className="italic text-clay">you</span> are.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-alabaster/80">
            Message us now and your bag could be on the scale today. Call to confirm today's
            hours.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <WhatsAppButton
              tone="cream"
              label="Book on WhatsApp"
              message="Hello Lawmann, I would like to book a laundry wash."
            />
            <CallButton tone="cream" />
          </div>
        </div>
      </Section>
    </PublicPage>
  );
}
