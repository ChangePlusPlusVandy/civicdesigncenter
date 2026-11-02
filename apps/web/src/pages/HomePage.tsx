import { ArrowRight, Landmark, Users, Waypoints } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

const features = [
  {
    icon: Users,
    title: "Build together",
    copy: "Small teams make city decisions from their own devices.",
  },
  {
    icon: Waypoints,
    title: "See the system",
    copy: "Watch money, population, pollution, and happiness interact.",
  },
  {
    icon: Landmark,
    title: "Learn by doing",
    copy: "Teachers facilitate a shared simulation grounded in civic choices.",
  },
];

export function HomePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
      <section className="max-w-4xl">
        <p className="mb-5 text-xs font-bold uppercase tracking-[0.18em] text-primary">
          A classroom city-planning simulation
        </p>
        <h1 className="max-w-3xl font-serif text-5xl leading-[0.98] tracking-[-0.055em] sm:text-7xl">
          Build a city.{" "}
          <span className="italic text-primary">Live with the choices.</span>
        </h1>
        <p className="mt-7 max-w-2xl text-lg leading-8 text-muted-foreground">
          City Settlers puts students in charge of growth, resources, and
          tradeoffs while a teacher guides the room through a shared civic
          simulation.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/join">
              Join a game <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link to="/teach">Teacher console</Link>
          </Button>
          <Button asChild variant="ghost" size="lg">
            <Link to="/prototype/world">Explore the 3D world</Link>
          </Button>
        </div>
      </section>

      <section className="mt-20 grid overflow-hidden rounded-xl border bg-card md:grid-cols-3">
        {features.map(({ icon: Icon, title, copy }, index) => (
          <article
            key={title}
            className="border-b p-6 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"
          >
            <div className="flex items-center justify-between">
              <Icon className="size-5 text-primary" aria-hidden="true" />
              <span className="text-xs font-bold tracking-widest text-[var(--orange)]">
                0{index + 1}
              </span>
            </div>
            <h2 className="mt-8 text-lg font-bold tracking-tight">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {copy}
            </p>
          </article>
        ))}
      </section>
    </div>
  );
}
