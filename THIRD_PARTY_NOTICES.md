# Third-Party Notices

This project uses the **Swiss Ephemeris** astronomical calculation library
(via the `@swisseph/node` npm package), which is required to preserve the
following notices in any distribution.

## Swiss Ephemeris

```
Copyright (C) 1997 - 2021 Astrodienst AG, Switzerland.  All rights reserved.
Authors: Dieter Koch and Alois Treindl, Astrodienst Zurich
```

Swiss Ephemeris is distributed with **no warranty of any kind**. Astrodienst
makes Swiss Ephemeris available under a **dual-license model**: developers
must choose either

1. the **GNU Affero General Public License v3 (AGPL-3.0)**, which requires
   the *entire* software project incorporating Swiss Ephemeris to also be
   licensed under the AGPL (or a compatible license) — see
   <https://www.gnu.org/licenses/agpl-3.0.html>; or
2. the commercial **Swiss Ephemeris Professional License**, purchased
   directly from Astrodienst — see <https://www.astro.com/swisseph/>.

The names of the Swiss Ephemeris authors or of the copyright holder
(Astrodienst) must not be used for promoting any product derived from this
software without prior written permission from Astrodienst.

**This project (AstroMitra Kundli Calculation API) has been released under
the AGPL-3.0-or-later license (see `LICENSE`) specifically to satisfy option
(1) above.** See the "License & Compliance Obligations" section of
`README.md` for what that means in practice for anyone deploying this API.

## `@swisseph/node` (npm wrapper)

The Node.js bindings themselves (`@swisseph/node` and `@swisseph/core` on
npm) are, independently of the underlying C library, also licensed
AGPL-3.0. Package: <https://github.com/swisseph-js/swisseph>.

## Other dependencies

All other dependencies used by this project (Express, Mongoose, Axios,
Luxon, Helmet, CORS, express-rate-limit, express-validator, dotenv) are
permissively licensed (MIT). Run `npm ls --all` / `npm view <pkg> license`
for the current, authoritative license of each installed version.
