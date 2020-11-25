const express = require('express');
const app = express();
const iconv = require('iconv-lite');
const { JSDOM } = require('jsdom');
const fetch = require('node-fetch');

const poptext = (e) => {
    if (typeof e === 'string') {
        e = e.split(' ');
    }

    e.pop();
    if (e.join(' ').length > 2048) {
        return poptext(e);
    }

    return e.join(' ');
};

const worker = async (query = null, page = 1, param = '') => {
    try {
        query = encodeURIComponent(query);

        let url = `https://pikabu.ru/${query}hot?${param}page=${page}`;
        let data = iconv.decode(await (await fetch(url)).buffer(), 'windows-1251');
        let dom = new JSDOM(data);
        let allPosts = [...dom.window.document.querySelectorAll('article.story')];

        if (!allPosts.length && page === 1) {
            url = `https://pikabu.ru/search?q=${query}?page=${page}`;
            data = iconv.decode(await (await fetch(url)).buffer(), 'windows-1251');
            dom = new JSDOM(data);
            allPosts = [...dom.window.document.querySelectorAll('article.story')];
        }

        if (!allPosts.length) {
            throw Error(`${url} \n ${data}`);
        }

        const posts = [];
        for (const post of allPosts) {
            try {
                const postBlocks = post.querySelector('div.story__content-inner');
                if (!postBlocks) {
                    continue;
                }

                const id = post.getAttribute('data-story-id');
                if (posts.some((i) => i.id === id)) {
                    continue;
                }

                const title = post.querySelector('a.story__title-link');
                const hiddenBlocks = post.querySelector('div.story__hidden-blocks');
                const tagSelector = post.querySelector('div.story__tags.tags');
                if (!tagSelector || !title) {
                    continue;
                }

                const blocks = hiddenBlocks ? [...postBlocks.children, ...hiddenBlocks.children]
                    : postBlocks.children;
                if (!blocks.length) {
                    continue;
                }

                const tags = [];
                for (const tag of post.querySelector('div.story__tags.tags').children) {
                    tags.push(tag.textContent);
                }

                const result = {
                    id,
                    title: title.textContent,
                    tags: tags.join('  '),
                    items: [],
                    mediaSize: 0,
                    url: title.href,
                };

                for (const el of blocks) {
                    try {
                        if (result.mediaSize > 1) {
                            result.tags += '  [обрезанный пост]';
                            break;
                        }

                        if (el.className.includes('text')) {
                            let text = '';
                            for (const p of el.children) {
                                if (text.length) {
                                    text += '\n';
                                }

                                const link = p.querySelector('a');
                                if ((text + p.textContent).length > 2048) {
                                    if (text.length) {
                                        result.items.push({ text });
                                        text = '';
                                    } else {
                                        text += poptext(p.textContent);
                                        result.tags += '  [обрезанный пост]';
                                        break;
                                    }
                                } else if (link) {
                                    text += `[${link.textContent}](${link.href})`;
                                } else {
                                    text += p.textContent;
                                }
                            }
                            result.items.push({ text });
                        } else if (el.className.includes('image')) {
                            const image = el.querySelector('img');
                            const sample = image.getAttribute('data-src');
                            const gif = el.querySelector('div.player');
                            if (sample) {
                                result.items.push({ image: image.getAttribute('data-large-image') });
                            } else if (gif) {
                                result.items.push({ image: gif.getAttribute('data-source') });
                            }

                            result.mediaSize += 1;
                        } else if (el.className.includes('video')) {
                            const video = el.querySelector('div.player');
                            result.items.push({
                                video: video.getAttribute('data-webm') || video.getAttribute('data-source'),
                            });
                            result.mediaSize += 1;
                        }
                    } catch (error) {
                        continue;
                    }
                }

                posts.push(result);
            } catch (error) {
                continue;
            }
        }

        return posts;
    } catch (e) {
        throw e;
    }
};

app.get('/', (req, res) => {
    res.send('Hello World');
});

app.get('/parse', async (req, res) => {
    const { query, page } = req.query;
    try {
        const result = await worker(query, page);
        res.json(result);
    } catch (error) {
        res.json({
            isError: true,
            message: error.message,
        });
    }
});

app.listen(3000);

console.log('ready');

