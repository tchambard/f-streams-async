import { assert } from 'chai';
import { setup } from 'f-mocha';
import { run, wait } from 'f-promise';
import * as fs from 'fs';
import { binaryFileReader, cutter, stringReader, textFileReader, textFileWriter, xmlFormatter, xmlParser } from '../..';
setup();

const { equal, ok, strictEqual, deepEqual } = assert;

function short(s: string) {
    return s.length < 50 ? s : s.substring(0, 47) + '...';
}

function parseTest(xml: string, js: any, skipRT?: boolean) {
    const full = '<?xml version="1.0"?><root>' + xml + '</root>\n';
    const parsed = stringReader(full)
        .transform(cutter(2)) //
        .transform(xmlParser('root'))
        .toArray();
    deepEqual(parsed[0].root, js, 'parse ' + short(xml));
    if (!skipRT) {
        const rt = stringReader(full)
            .transform(cutter(2)) //
            .transform(xmlParser('root')) //
            .transform(xmlFormatter('root'))
            .toArray()
            .join('');
        strictEqual(rt, full, 'roundtrip ' + short(full));
    }
}

function rtTest(name: string, xml: string, indent: string | undefined, result: any) {
    const full = '<?xml version="1.0"?><root>' + xml + '</root>\n';
    result = '<?xml version="1.0"?>' + (indent ? '\n' : '') + '<root>' + (result || xml) + '</root>\n';
    const rt = stringReader(full)
        .transform(cutter(2)) //
        .transform(xmlParser('root')) //
        .transform(
            xmlFormatter({
                tags: 'root',
                indent: indent,
            }),
        )
        .toArray()
        .join('');
    strictEqual(rt, result, 'roundtrip ' + full);
}

describe(module.id, () => {
    it('simple tag without attributes', () => {
        parseTest('<a/>', {
            a: {},
        });
        parseTest('<a></a>', {
            a: '',
        });
        parseTest('<a>5</a>', {
            a: '5',
        });
    });

    it('simple tag with attributes', () => {
        parseTest('<a x="3" y="4">5</a>', {
            a: {
                $: {
                    x: '3',
                    y: '4',
                },
                $value: '5',
            },
        });
        parseTest('<a x="3"></a>', {
            a: {
                $: {
                    x: '3',
                },
                $value: '',
            },
        });
        parseTest('<a x="3"/>', {
            a: {
                $: {
                    x: '3',
                },
            },
        });
    });

    it('entities', () => {
        parseTest('<a x="a&gt;b&amp;c&lt;"/>', {
            a: {
                $: {
                    x: 'a>b&c<',
                },
            },
        });
        parseTest('<a>a&gt;b&amp;c&lt;</a>', {
            a: 'a>b&c<',
        });
    });

    it('children', () => {
        parseTest('<a><b>3</b><c>4</c></a>', {
            a: {
                b: '3',
                c: '4',
            },
        });
        parseTest('<a><b x="2">3</b><c>4</c></a>', {
            a: {
                b: {
                    $: {
                        x: '2',
                    },
                    $value: '3',
                },
                c: '4',
            },
        });
        parseTest('<a><b>3</b><b>4</b><c>5</c></a>', {
            a: {
                b: ['3', '4'],
                c: '5',
            },
        });
    });

    it('cdata', () => {
        parseTest('<a><![CDATA[<abc>]]></a>', {
            a: {
                $cdata: '<abc>',
            },
        });
        parseTest('<a><![CDATA[]]></a>', {
            a: {
                $cdata: '',
            },
        });
    });

    it('comments in text', () => {
        parseTest(
            '<a>abc <!-- <b>def</b> --> ghi</a>',
            {
                a: 'abc  ghi',
            },
            true,
        );
    });

    it('reformatting', () => {
        rtTest('spaces outside', ' \r\n\t <a/> \t', undefined, '<a/>');
        rtTest('spaces inside tag', '<a  x="v1"\ny="v2"\t/>', undefined, '<a x="v1" y="v2"/>');
        rtTest('spaces around children', '<a> <b />\n<c\n/>\t</a>', undefined, '<a><b/><c/></a>');
        rtTest('spaces and cdata', '<a> \n<![CDATA[ <abc>\n\t]]>\t</a>', undefined, '<a><![CDATA[ <abc>\n\t]]></a>');
        rtTest('spaces in value', '<a> </a>', undefined, '<a> </a>');
        rtTest('more spaces in value', '<a> \r\n\t</a>', undefined, '<a> &#x0d;&#x0a;&#x09;</a>');
        rtTest(
            'indentation',
            '<a><b x="3">5</b><c><d/></c></a>',
            '\t',
            '\n\t<a>\n\t\t<b x="3">5</b>\n\t\t<c>\n\t\t\t<d/>\n\t\t</c>\n\t</a>\n',
        );
    });

    it('empty element in list', () => {
        parseTest(
            '<a><b></b><b>x</b><b></b></a>',
            {
                a: {
                    b: ['', 'x', ''],
                },
            },
            true,
        );
    });

    it('rss feed', () => {
        const entries = textFileReader(__dirname + '/../../../test/fixtures/rss-sample.xml') //
            .transform(cutter(2)) //
            .transform(xmlParser('rss/channel/item'))
            .toArray();
        strictEqual(entries.length, 10);
        strictEqual(entries[0].rss.channel.title, 'Yahoo! Finance: Top Stories');
        strictEqual(entries[0].rss.channel.item.title, 'Wall Street ends down on first trading day of 2014');
        strictEqual(entries[9].rss.channel.title, 'Yahoo! Finance: Top Stories');
        strictEqual(
            entries[9].rss.channel.item.title,
            "2013's big winners abandoned 'safety' and bet on central bankers",
        );
    });

    it('binary input', () => {
        const entries = binaryFileReader(__dirname + '/../../../test/fixtures/rss-sample.xml') //
            .transform(cutter(2)) //
            .transform(xmlParser('rss/channel/item'))
            .toArray();
        strictEqual(entries.length, 10);
        strictEqual(entries[0].rss.channel.title, 'Yahoo! Finance: Top Stories');
        strictEqual(entries[0].rss.channel.item.title, 'Wall Street ends down on first trading day of 2014');
        strictEqual(entries[9].rss.channel.title, 'Yahoo! Finance: Top Stories');
        strictEqual(
            entries[9].rss.channel.item.title,
            "2013's big winners abandoned 'safety' and bet on central bankers",
        );
    });

    it('rss roundtrip', () => {
        let expected = wait(cb => fs.readFile(__dirname + '/../../../test/fixtures/rss-sample.xml', 'utf8', cb));
        let result = textFileReader(__dirname + '/../../../test/fixtures/rss-sample.xml') //
            .transform(cutter(5)) //
            .transform(xmlParser('rss/channel/item')) //
            .transform(
                xmlFormatter({
                    tags: 'rss/channel/item',
                    indent: '  ',
                }),
            ) //
            .toArray()
            .join('');
        expected = expected.replace(/\r?\n */g, '').replace(/<\!--.*-->/g, '');
        result = result.replace(/\r?\n */g, '');
        strictEqual(result, expected);
    });

    it('escaping', () => {
        let xml = '<a>';
        let js = '';
        for (let i = 0; i < 0x10000; i++) {
            if (i > 300 && i % 100) continue;
            // tab, cr, lf, ' and " could be formatted verbatim but we escape them
            if ((i >= 0x20 && i <= 0x7e) || (i >= 0xa1 && i <= 0xd7ff) || (i >= 0xe000 && i <= 0xfffd)) {
                if (i >= 0x2000 && i < 0xd000) continue; // skip to speed up test
                const ch = String.fromCharCode(i);
                if (ch === '<') xml += '&lt;';
                else if (ch === '>') xml += '&gt;';
                else if (ch === '&') xml += '&amp;';
                else if (ch === '"') xml += '&quot;';
                else if (ch === "'") xml += '&apos;';
                else xml += ch;
            } else {
                let hex = i.toString(16);
                while (hex.length < 2) hex = '0' + hex;
                while (hex.length > 2 && hex.length < 4) hex = '0' + hex;
                xml += '&#x' + hex + ';';
            }
            js += String.fromCharCode(i);
        }
        xml += '</a>';
        parseTest(xml, {
            a: js,
        });
    });
});
