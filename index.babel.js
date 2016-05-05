'use strict';

import { rename, writeFile } from 'fs';
import { basename, join, sep } from 'path';
import { chunk } from 'lodash';
import mkdirp from 'mkdirp';
import glob from 'glob';
import moment from 'moment';
import GIFEncoder from 'gifencoder';
import png from 'png-js';
import assign from 'assignment';
import Pageres from 'pageres';
import Spritesmith from 'spritesmith';
import histogram from 'histogram';
import tmp from 'tmp';
import { promisify } from 'bluebird';
import { exec } from 'child_process';
import diff from 'image-diff-2';
import debug from 'debug';
const debuglog = debug('shots');
const pglob = promisify(glob);
const pmkdirp = promisify(mkdirp);
const prename = promisify(rename);
const pwriteFile = promisify(writeFile);
const rsep = new RegExp(sep, 'g');
const rsize = /\d+x\d+/;
const rtimestamp = /\d{14}/;
const timeformat = 'YYYYMMDDHHmmss';

function d (message, result) {
  debuglog(message);
  return result;
}

function getStart (pageFiles) {
  const [last] = sortByStamps(pageFiles);
  return last ? toMoment(last).format(timeformat) : '1800';
}

function sortByStamps (files) {
  return files.sort((a, b) => toMoment(b).isAfter(toMoment(a)) ? 1 : -1);
}

function sortBySize (files) {
  return files.sort((a, b) => toSize(b) === toSize(a) ? 0 : 1);
}

function sortByDomains (domains, files) {
  return files.sort((a, b) => toDomainIndex(b) > toDomainIndex(a) ? 1 : -1);
  function toDomainIndex (file) {
    const slug = domainSlug(basename(file));
    for (let domain of domains) {
      if (slug.startsWith(domain)) {
        return domains.indexOf(domain);
      }
    }
    return -1;
  }
}

function toMoment (file) {
  const [timestamp] = rtimestamp.exec(basename(file)) || [];
  return moment(timestamp, timeformat);
}

function toSize (file) {
  const [size] = rsize.exec(basename(file)) || [];
  return size;
}

function domainSlug (domain) {
  return domain
    .replace(/[^a-z0-9]+/ig, '-')
    .replace(/-+/g, '-');
}

function whereDomains (domains) {
  return file => {
    const prepared = domainSlug(basename(file));
    return domains.some(domain => prepared.startsWith(domain));
  };
}

function getPageresOpts (pageresUser) {
  const pageresDefaults = {
    crop: true,
    scale: 1,
    sizes: ['1024x768']
  };
  return assign(pageresDefaults, pageresUser);
}

function getPageres (opts) {
  d('creating pageres instance');
  return new Pageres(opts);
}

function shots (options = {}) {
  const {
    dest = tmp.dirSync().name,
    concurrency = 6,
    pageres: userPageresOpts,
    site,
    sites = [],
    tolerance = 95
  } = options;
  d(`dest directory set to: ${dest}`);
  const prOpts = getPageresOpts(userPageresOpts);
  const threshold = (100 - tolerance) / 100 ; // [0..1] where 0=identical,1=different
  const pages = join(dest, 'pages');
  const screenshots = join(dest, 'screenshots');
  const diffs = join(dest, 'diffs');
  const output = join(dest, 'output');
  const { sizes, scale } = prOpts;
  const s = sites || site || null;
  const domains = Array.isArray(s) ? s : [s];
  const domainSlugs = domains.map(domainSlug);
  const rglob = pattern => pglob(pattern).then(files =>
    sortByStamps(files.filter(whereDomains(domainSlugs)))
  );

  return Promise
    .all([
      d('pmkdirp(pages)', pmkdirp(pages)),
      d('pmkdirp(screenshots)', pmkdirp(screenshots)),
      d('pmkdirp(diffs)', pmkdirp(diffs)),
      d('pmkdirp(output)', pmkdirp(output))
    ])
    .then(() => d(`rglob('${pages}/*.html')`, rglob(`${pages}/*.html`)))
    .then(pageFiles => Promise
      .all(domains
      .map(site => new Promise((resolve, reject) => {
        const cmd = `waybackpack ${site} -d ${pages} --start ${getStart(pageFiles)}`;
        d(cmd);
        exec(cmd, err => err ? reject(err) : resolve());
      }))
    ))
    .then(() => Promise.all([
      d(`rglob('${pages}/*.html')`, rglob(`${pages}/*.html`)),
      d(`rglob('${screenshots}/*.html.png')`, rglob(`${screenshots}/*.html.png`))
    ]))
    .then(([sources, destinations]) => d(`shot chunk(sources) and filter, len=${sources.length}`,
      chunk(
        sources
          .filter(source => destinations
          .indexOf(`${source}.png`
            .replace(`${pages}`, `${screenshots}`)
            .replace(`.html.png`, `-${sizes[0]}.html.png`)
          ) === -1),
        Math.ceil(concurrency / sizes.length)
      )
    ))
    .then(chunks => chunks.reduce((p, chunk, i) => p.then(() => d(`reducing chunk ${i+1}/${chunks.length}, len=${chunk.length}`, chunk)
      .reduce((ctx, source) => d(`adding pageres src ${source}, sizes=${sizes}`, ctx.src(source, sizes)), getPageres(prOpts))
      .dest(screenshots)
      .run()
      .then(streams => d(`renaming streams, len=${streams.length}`, Promise.all(
        streams.map(stream => d(`renaming ${stream.filename}`, prename(
          join(screenshots, stream.filename),
          join(screenshots, stream.filename
            .replace(`${pages.replace(rsep, '!')}!`, '')
            .replace(/\.html(-[\dx]+)[\w-]*\.png$/, '$1.html.png')
          )
        )))
      )))
    ), d(`shot chunk reducer, len=${chunks.length}`, Promise.resolve())))
    .then(() => d(`rglob('${screenshots}/*.html.png')`, rglob(`${screenshots}/*.html.png`)))
    .then(screenshotFiles => d('sortBySize(sortByDomains(domainSlugs, screenshotFiles))',
      sortBySize(sortByDomains(domainSlugs, screenshotFiles))
      .reverse()
      .map((screenshot, i) => ([
        screenshot,
        screenshotFiles[i - 1],
        screenshot.replace(screenshots, diffs)
      ]))
      .slice(1)
    ))
    .then(comparisions => d(`diff chunk(comparisions, concurrency), len=${comparisions.length}`, chunk(comparisions, concurrency)))
    .then(chunks => chunks.reduce((p, chunk, i) => p.then(ignores => Promise
      .all(d(`reducing chunk ${i+1}/${chunks.length}, ignore=${ignores.length}`, chunk)
      .map(([actualImage, expectedImage, diffImage], i) =>
        new Promise((resolve, reject) => d(`diffing image reel ${i+1}/${chunk.length} [
    actual ${actualImage}
    expect ${expectedImage}
    diff   ${diffImage} ]`,
          diff({ actualImage, expectedImage, diffImage, threshold }, (err, same) => {
            if (err) {
              reject(err);
              return;
            }
            if (same) {
              d(`diffed ${i+1}/${chunk.length} ${actualImage} [DUPE]`);
              resolve(false);
              return;
            }
            histogram(actualImage, (err, data) => err
              ? d(`diffed ${i+1}/${chunk.length} ${actualImage} [ERR]`, reject(err))
              : data.colors.rgb > 32
                ? d(`diffed ${i+1}/${chunk.length} ${actualImage} [PASS]`, resolve(true))
                : d(`diffed ${i+1}/${chunk.length} ${actualImage} [BLANK]`, resolve(false)));
          })))
          .then(passed => passed || ignores.push(actualImage))
      ))
      .then(() => ignores))
    , d(`diff chunk reducer, len=${chunks.length}`, Promise.resolve([]))))
    .then(ignores => d(`rglob('${screenshots}/*.html.png'), ignore=${ignores.length}`, rglob(`${screenshots}/*.html.png`))
      .then(screenshotFiles => ([
        screenshotFiles.filter(screenshot => ignores.indexOf(screenshot) === -1),
        screenshotFiles,
        ignores
      ]))
    )
    .then(([relevant, all, ignores]) => {
      d(`found ${relevant.length}/${all.length} relevant screenshots (${ignores.length} ignored)`);
      const buckets = sizes.map(size => ([
        size,
        sortByStamps(relevant.filter(file => toSize(file) === size)).reverse()
      ]));
      return Promise
        .all(buckets
          .map(([size, src]) => new Promise((resolve, reject) => d(`creating ${size} spritesheet`, Spritesmith)
          .run({ src, algorithm: 'left-right' }, (err, result) => err
            ? reject(err)
            : resolve(result.image)
          ))
          .then(image => pwriteFile(join(output, `${size}.png`), image))
        ))
        .then(() => Promise
        .all(buckets
          .map(([size, src]) => d(`creating ${size} gif`, Promise)
          .all(src
            .map(file => new Promise(resolve => png.decode(file, pixels => resolve(pixels))))
          )
          .then(frames => {
            const rec = new GIFEncoder(...size.split('x').map(x => x * scale));
            rec.start();
            rec.setRepeat(0);
            rec.setDelay(200);
            frames.forEach(frame => rec.addFrame(frame));
            rec.finish();
            return rec.out.getData();
          })
          .then(image => pwriteFile(join(output, `${size}.gif`), image))
        ))
      );
    })
    .then(() => d('done.', dest))
    .catch(reason => d(`ERR! ${reason}`, Promise.reject(reason)));
}

export default shots;
