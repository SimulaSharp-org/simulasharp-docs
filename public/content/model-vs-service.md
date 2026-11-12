# Model vs service

You've decided some capability needs to exist. The next question is *what kind of artifact* it should be — a
[**Model**](#/guide/models-and-containment) or a [**Service**](#/guide/services). They look similar (both derive a base,
both have `Configure()`, both run on a site, both must be `partial`) but they answer different questions and have
opposite threading contracts. Choosing wrong makes your topology awkward; choosing right makes it obvious.

## The one-line test

> A **Model** is a *simulated entity* — a thing in the tree with its own state, owned by whatever contains it.
> A **Service** is a *shared capability* — a thing on its own thread that many models reach, owned by no one.

If you can point at the thing and say "the plant *has* a pump," it's a model, contained. If you say "everyone *uses* the
bus," it's a service.

## The two shapes, side by side

```mermaid
flowchart TB
  subgraph containment["Containment — a Model"]
    direction TB
    P["Plant (root, Site A)"] --> PU["Pump"]
    P --> V["Valve"]
    Note1["owned · same thread · direct calls"]
  end
  subgraph shared["A Service"]
    direction TB
    B1["Model A"] -. "marshalled" .-> BUS["Bus (own thread)"]
    B2["Model B"] -. "marshalled" .-> BUS
    B3["Model C"] -. "marshalled" .-> BUS
    Note2["shared · own thread · every call cross-thread"]
  end
  classDef a fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
  classDef s fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  class P,PU,V a;
  class BUS s;
```

- A **Model** lives in a [containment subtree](#/guide/models-and-containment) and shares that subtree's thread. Its
  owner calls it **directly**. It is *part of* one thing.
- A **Service** has its **own** SimSite and is never in a subtree, so **every** model↔service call is
  [marshalled](#/guide/services) — there is no same-site fast path. It is *shared by* many things.

## The decision table

| Question | → Model | → Service |
|---|---|---|
| Is it *owned by* one parent, or *shared by* many? | owned by one | shared by many |
| Does it have its own state that others read/mutate? | state belongs to its subtree | central state many models depend on |
| Who calls it? | mostly its container/subtree | lots of unrelated models |
| Is it point-to-point or many-to-one? | point-to-point | many-to-one / broadcast |
| Does "contained by X" describe it naturally? | yes | no — it floats above the tree |
| Would putting it in one subtree force *everyone else* to cross into that subtree? | no | yes — that's the smell of a service |
| Fan-out broadcast to subscribers? | a [global event](#/guide/events) — any model can trigger it | `[ServiceEvent]`, or a global event |

The second-to-last row is the tell. If making something a model would force half the tree to hold a cross-site
`[CrossReference<T>]` into one subtree just to reach it, it wants to be a service. *Broadcast* alone — "range updated,"
"eclipse started" — is no longer a reason for a service: a [global event](#/guide/events) is an ownerless pub/sub
channel declared in the assembly's `Events:` block, which any model or service may trigger (`[EventReference]`) and
subscribe to (`[EventHandler]`). A service's [`[ServiceEvent]`](#/guide/services) is the right fan-out when the
*service* is the one publisher, because it owns the state that changed.

## Decision flow

```mermaid
flowchart TD
  START(["A capability needs to exist"]) --> Q1
  Q1{"Is it a distinct entity with<br/>its own state in the sim?"}
  Q1 -->|"no — it's shared infra"| SVC
  Q1 -->|"yes"| Q2
  Q2{"Is it naturally owned by<br/>exactly one parent model?"}
  Q2 -->|"yes"| MODEL["MODEL<br/>Container&lt;T&gt; in the parent"]
  Q2 -->|"no — many models need it"| Q3
  Q3{"Point-to-point link to a<br/>specific peer, or broadcast/<br/>shared by many?"}
  Q3 -->|"point-to-point"| REF["MODEL + CrossReference&lt;T&gt;<br/>(a link, not ownership)"]
  Q3 -->|"shared resource /<br/>blackboard"| SVC["SERVICE<br/>own site · ServiceEvent / ServiceRequest"]
  Q3 -->|"broadcast only,<br/>no shared state"| EVT["GLOBAL EVENT<br/>Events: · EventHandler / EventReference"]
  classDef m fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
  classDef s fill:#fef9c3,stroke:#ca8a04,color:#713f12;
  class MODEL,REF,EVT m;
  class SVC s;
```

There's a middle option worth naming: a thing can be a **model reached by `[CrossReference<T>]`** — still an owned entity in
*some* subtree, but linked to point-to-point from elsewhere. Reach for a full service only when the capability is
genuinely *shared by many* and *owned by none*.

## Worked examples

| The thing | Model or service? | Why |
|---|---|---|
| A **pump** in a plant | **Model**, contained | owned by the plant; its state is the plant's |
| A **valve** the pump commands | **Model**, same subtree | owned; direct lock-free calls |
| A **sensor** a controller on another site reads | **Model** + `[CrossReference<T>]` | still owned by its subsystem; just linked cross-site |
| A **data bus** every subsystem talks on | **Service** | shared by all; owned by none; needs broadcast |
| An **environment / FES blackboard** (orbit, weather, sun) | **Service** | many models sample it; it's the world, not a part |
| A **shared resource pool** (channels, tokens) | **Service** | central state, allocated to many; `[ServiceRequest]` |
| A **comms relay** fanning messages out | **Service** | many-to-many broadcast — `[ServiceEvent]` |
| A **reaction wheel** on a satellite | **Model**, contained by ADCS | a physical part of one subsystem |
| An **"eclipse started"** notice many subsystems react to | **Global event** | broadcast with no owner and no shared state |

The environment/blackboard case is the clearest service: it's the *shared world state* every subsystem reads. Making it
a model would mean picking one subsystem to "own the universe" and forcing all the others to reach into it — exactly the
smell the table flags.

## Cost and consequence

> **Consequence for design.** A service centralizes shared state on **one thread** — which is its whole value (a natural
> serialization point, no locks in its handlers) and its whole risk (a **bottleneck** if every model round-trips through
> it each tick). Two habits keep it healthy: prefer fire-and-forget [`[ServiceEvent]`](#/guide/services) broadcasts
> ("something changed") over synchronous [`[ServiceRequest]`](#/guide/services) round-trips, and let subscribers **cache**
> the pushed value locally instead of re-requesting it. A model, by contrast, has no inherent bottleneck — it shares its
> owner's thread — but it can't be shared or broadcast to.

## What this means for you

| You have… | Make it a… |
|---|---|
| An entity owned by one parent | **Model** in a `Container<T>` |
| An entity owned by one subtree but read by a specific peer elsewhere | **Model** + `[CrossReference<T>]` link |
| A capability many unrelated models depend on | **Service** |
| Shared world/environment state everyone samples | **Service** (blackboard) |
| Broadcast "something changed" to subscribers | **Service** with `[ServiceEvent]` if the service owns the change, else a [global event](#/guide/events) |
| A shared resource to allocate on request | **Service** with `[ServiceRequest]` |

Related reading: [services](#/guide/services) (the mechanics), [associations](#/guide/associations) (`Container<T>` /
`[Reference<T>]` / `[CrossReference<T>]`), [choosing a topology](#/guide/choosing-a-topology) (where the sites fall), and the
[shared-service scenario](#/guide/scenario-shared-service) (a worked build).
