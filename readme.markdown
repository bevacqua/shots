# shots

> pull down the entire Internet into a single animated gif.

# description

by leveraging [`waybackpack`][wbp] &mdash; a python program that pulls down the entire Wayback Machine archive for a given URL &mdash; `shots` goes one step further, by grabbing screenshots out of each of the archived pages, filtering out visually similar pages and blank pages, and ultimately creating a filmstrip of the website over time, as well as an animated gif that shows how the website evolved over time.

# sample

[![evolution of ponyfoo.com over time][evo]][web]

[![evolution of amazon.com over time][ama]][amzn]

# install

```shell
pip install waybackpack==0.1.1
npm i shots -S
```

# usage

```js
import shots from 'shots';

shots({
  dest: 'resources/shots',
  site: 'amazon.com'
});
```

the `shots` function will return a `Promise` that'll resolve once an animated gif of the site's history, along with a side-by-side static filmstrip image are generated in `resources/shots/output` as `1024x768.gif` and `1024x768.png` respectively.

_you can specify different options._

# cli

fairly simple.

```shell
shots amazon.com
```

outputs the path to your resulting gif, something like:

```
/var/folders/k_/9_8vfx9d48g_mrv71w2gbbc80000gn/T/tmp-705763juvDuD6zE3F/output/1024x768.gif
```

has some options. run `shots` to print the following help text to your terminal.

```
must supply at least one site.

usage:
  shots <site> [options]

options:
  -c, --concurrency      concurrency level (6)
  -o, --out, --output    output directory (random)
  -r, --reverse          reversed output, from present into the past
  -t, --tolerance        image diff similarity tolerance, 0-100 (95)
  -v, --verbose          verbose mode, outputs debugging information
      --no-diffing       disables diffing stage
      --no-download      disables download stage
      --no-filmstrip     disables filmstrip stage
      --no-gif           disables gif stage
      --no-screenshots   disables screenshots stage

example:
  shots amazon.com -o shots/amazon -c 12 -t 65

output:
  path/to/recording.gif
```

# api

the `shots` api is exported as a single `shots(options)` function that returns a `Promise`. its `options` are outlined below.

# `options`

there are several `options`, described next.

## `options.dest`

directory used to store all wayback machine archive pages, their screenshots, the diffs between those screenshots, and your glorious output gifs. defaults to a temporary directory.

note that you'll get that path back from the `shots` promise, e.g:

```js
shots().then(dest => {
  // ...
})
```

## `options.concurrency`

concurrency level used throughout the lib. determines how many screenshots are being taken at any given time, or how many diffs are being computed, etc.

defaults to `6`.

## `options.pageres`

options merged with defaults shown below and passed to [`pageres`][pr]. only `9999x9999`-formatted `sizes` are supported _(e.g: don't use `'iphone 5s'`)_.

```json
{
  "crop": true,
  "scale": 1,
  "sizes": ["1024x768"]
}
```

## `options.sites`

a site _(or any url, really)_ that you want to work with. can also be an array of sites.

## `options.site`

alias for `options.sites`.

## `options.stages`

an object describing whether different stages of the `shots` process are enabled. set a stage to `false` to skip that stage. defaults:

```json
{
  "download": true,
  "screenshots": true,
  "diffing": true,
  "filmstrip": true,
  "gif": true
}
```

see [stages](#stages) for more info on each stage.

## `options.tolerance`

number between `0` and `100` where `100` means every screenshot will be considered different, whereas `0` means every screenshot will be considered the same. only "duplicate" screenshots (within the tolerated range) will be used when building the gif and filmstrip image.

# stages

<sub>note that `shots` has a long runtime, due to the nature of the task it performs. be prepared to wait a few minutes until the gif is finally written to disk.</sub>

the following steps happen in series. the tasks in each step are executed concurrently where possible.

- `[download]` runs `waybackpack` for every provided `options.site`, starting at the last timestamp that can be found in the `${dest}/pages` directory to save time
- `[screenshots]` takes screenshots of every archive page, except for pages we have existing screenshots for at `${dest}/screenshots`
- `[diffing]` computes difference between every screenshot and the previous ones
  - screenshots considered to be the same according to `tolerance` are discarded
  - screenshots considered to be noise _(e.g: failed page loads)_ are discarded
- `[filmstrip]` creates the filmstrip
- `[gif]` creates the gif

# debugging and logging

if you want to print debugging statements, `shots` uses `debug`, so you can do `DEBUG=shots node app` and you'll see tons of debug information pop into your screen.

you need `cairo` bindings installed and `imagemagick` installed and available in your path.

# license

mit

[evo]: https://github.com/ponyfoo/ponyfoo/blob/master/resources/shots/output/1024x768.gif
[web]: https://ponyfoo.com
[wbp]: https://github.com/jsvine/waybackpack
[pr]: https://github.com/sindresorhus/pageres
[ama]: https://github.com/bevacqua/shots/blob/master/sample/amazon/output/1024x768.gif
[amzn]: https://www.amazon.com
