import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';
import * as XLSX from 'xlsx';
import jszip from 'jszip';
import { DriveStorageService } from './driveStorageService';
import { SheetsRepository } from './sheetsRepository';
import { parseDocumentBuffer } from './documentParser';
import { DocumentRecord, ExtractedDocumentFile, DocumentChunk } from '../src/types/spak';

export interface DemoFileSpec {
  fileName: string;
  title: string;
  topic: string;
  format: 'PDF' | 'DOCX' | 'TXT' | 'XLSX' | 'PPTX';
  mimeType: string;
  sourceAgency: string;
  documentDate: string;
  description: string;
  generateContent: () => Promise<Buffer>;
}

const WATERMARK = 'DATA SIMULASI — BUKAN DOKUMEN RESMI';

async function makeSimPdf(title: string, agency: string, date: string, paragraphs: string[]): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const page = pdfDoc.addPage([595.28, 841.89]);
  const margin = 50;
  let y = 841.89 - margin;

  page.drawText(WATERMARK, {
    x: margin,
    y,
    size: 9,
    font: fontBold,
    color: rgb(0.85, 0.2, 0.2),
  });
  y -= 25;

  page.drawText(title, {
    x: margin,
    y,
    size: 14,
    font: fontBold,
    color: rgb(0.09, 0.21, 0.36),
  });
  y -= 16;

  page.drawText(`Instansi: ${agency} | Tanggal: ${date}`, {
    x: margin,
    y,
    size: 10,
    font: fontRegular,
    color: rgb(0.3, 0.35, 0.45),
  });
  y -= 25;

  for (const para of paragraphs) {
    const words = para.split(' ');
    let currentLine = '';
    for (const w of words) {
      const testLine = currentLine ? `${currentLine} ${w}` : w;
      if (fontRegular.widthOfTextAtSize(testLine, 10) > 490) {
        page.drawText(currentLine, { x: margin, y, size: 10, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
        y -= 14;
        currentLine = w;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) {
      page.drawText(currentLine, { x: margin, y, size: 10, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
      y -= 18;
    }
  }

  return Buffer.from(await pdfDoc.save());
}

async function makeSimDocx(title: string, agency: string, date: string, paragraphs: string[]): Promise<Buffer> {
  const doc = new Document({
    title,
    sections: [
      {
        children: [
          new Paragraph({
            children: [new TextRun({ text: WATERMARK, bold: true, color: 'DC2626', size: 18 })],
          }),
          new Paragraph({
            heading: HeadingLevel.TITLE,
            children: [new TextRun({ text: title, bold: true, size: 28, color: '17365D' })],
          }),
          new Paragraph({
            children: [
              new TextRun({
                text: `Instansi: ${agency} | Tanggal: ${date}`,
                italics: true,
                size: 20,
                color: '64748B',
              }),
            ],
          }),
          new Paragraph({ text: '' }),
          ...paragraphs.map(
            (p) =>
              new Paragraph({
                children: [new TextRun({ text: p, size: 22 })],
              })
          ),
        ],
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

function makeSimTxt(title: string, agency: string, date: string, paragraphs: string[]): Buffer {
  const text = [
    WATERMARK,
    '=================================================================',
    `JUDUL   : ${title}`,
    `INSTANSI: ${agency}`,
    `TANGGAL : ${date}`,
    '=================================================================',
    '',
    ...paragraphs,
    '',
    WATERMARK,
  ].join('\n\n');
  return Buffer.from(text, 'utf-8');
}

function makeSimXlsx(sheetName: string, headers: string[], rows: any[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const wsData = [
    [WATERMARK],
    [],
    headers,
    ...rows,
  ];
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

async function makeSimPptx(title: string, agency: string, slides: { title: string; bullets: string[] }[]): Promise<Buffer> {
  const zip = new jszip();
  // Basic OpenXML PPTX envelope
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  ${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join('\n  ')}
</Types>`);

  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`);

  zip.file('ppt/presentation.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    ${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 1}"/>`).join('\n    ')}
  </p:sldIdLst>
</p:presentation>`);

  slides.forEach((s, idx) => {
    const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:txBody>
          <a:bodyPr/><a:lstStyle/>
          <a:p><a:r><a:t>${s.title} (${WATERMARK})</a:t></a:r></a:p>
          ${s.bullets.map((b) => `<a:p><a:r><a:t>- ${b}</a:t></a:r></a:p>`).join('\n          ')}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
</p:sld>`;
    zip.file(`ppt/slides/slide${idx + 1}.xml`, slideXml);
  });

  return await zip.generateAsync({ type: 'nodebuffer' });
}

/**
 * 22. DEMO GENERATOR: 20 Simulasi File across 4 Themes (5 files per theme: PDF, DOCX, TXT, XLSX, PPTX)
 */
export function buildDemoCatalog(): DemoFileSpec[] {
  return [
    // TEMA 1: INFRASTRUKTUR TELEKOMUNIKASI (5 file)
    {
      fileName: 'SIM_01_Laporan_Audit_BTS_3T_Papua_Maluku.pdf',
      title: 'Laporan Evaluasi dan Audit Teknis BTS 4G Wilayah 3T Papua dan Maluku',
      topic: 'Infrastruktur Telekomunikasi',
      format: 'PDF',
      mimeType: 'application/pdf',
      sourceAgency: 'Kemenkomdigi & BAKTI',
      documentDate: '2026-02-14',
      description: 'Audit teknis ketersediaan pasokan listrik dan transmisi backhaul satelit VSAT pada 412 lokasi site BTS wilayah perbatasan.',
      generateContent: () =>
        makeSimPdf(
          'Laporan Evaluasi dan Audit Teknis BTS 4G Wilayah 3T Papua dan Maluku',
          'Kemenkomdigi & BAKTI',
          '2026-02-14',
          [
            'Operasionalisasi 412 BTS 4G di daerah tertinggal, terdepan, dan terluar (3T) di Papua Barat dan Maluku menghadapi kendala pasokan solar generator dan cuaca ekstrem.',
            'Kapasitas transmisi backhaul satelit orbit geostasioner saat ini terbatas pada throughput rata-rata 8 Mbps per site, mengakibatkan latensi tinggi di atas 580 ms.',
            'Rekomendasi teknis mencakup percepatan integrasi terminal satelit LEO (Low Earth Orbit) dan micro-grid panel surya hibrida berkapasitas 5 kWp.',
          ]
        ),
    },
    {
      fileName: 'SIM_02_Telaahan_Regulasi_Spektrum_5G.docx',
      title: 'Telaahan Staf Harmonisasi Alokasi Spektrum 700 MHz dan 3.5 GHz untuk 5G',
      topic: 'Infrastruktur Telekomunikasi',
      format: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sourceAgency: 'Kemenko Polkam - Asdep Telekomunikasi',
      documentDate: '2026-03-01',
      description: 'Kajian insentif regulasi penataan frekuensi analog switch-off 700 MHz untuk pemerataan broadband nasional.',
      generateContent: () =>
        makeSimDocx(
          'Telaahan Staf Harmonisasi Alokasi Spektrum 700 MHz dan 3.5 GHz untuk 5G',
          'Kemenko Polkam - Asdep Telekomunikasi',
          '2026-03-01',
          [
            'Pasca penuntasan Analog Switch Off (ASO), digital dividend frekuensi 700 MHz sebesar 112 MHz perlu dilelang secara transparan guna mendukung konektivitas pedesaan.',
            'Biaya Hak Penggunaan (BHP) frekuensi perlu mempertimbangkan skema multi-year insentif investasi infrastruktur bagi operator seluler.',
            'Aspek pertahanan dan keamanan mewajibkan cadangan spektrum pita khusus untuk komunikasi kebencanaan dan militer sebesar minimal 10 MHz.',
          ]
        ),
    },
    {
      fileName: 'SIM_03_Risalah_Rapat_Koordinasi_Palapa_Ring.txt',
      title: 'Risalah Rapat Koordinasi Ketahanan Jaringan Backbone Palapa Ring Integrasi',
      topic: 'Infrastruktur Telekomunikasi',
      format: 'TXT',
      mimeType: 'text/plain',
      sourceAgency: 'Kemenko Polkam',
      documentDate: '2026-03-12',
      description: 'Catatan koordinasi kementerian tentang proteksi kabel serat optik darat dan laut Palapa Ring dari ancaman vandalisme dan bencana alam.',
      generateContent: async () =>
        makeSimTxt(
          'Risalah Rapat Koordinasi Ketahanan Jaringan Backbone Palapa Ring Integrasi',
          'Kemenko Polkam',
          '2026-03-12',
          [
            'Rapat koordinasi tingkat eselon II membahas tingkat utilitas Palapa Ring Barat (82%), Tengah (44%), dan Timur (28%).',
            'Terdapat 14 insiden putusnya kabel darat (cut fiber) akibat pekerjaan jalan umum dan tanah longsor sepanjang kuartal I 2026.',
            'Disepakati pembentukan Satgas Bersama Pengamanan Aset Vital Telekomunikasi bersama Ditjen Bina Marga dan aparat kewilayahan.',
          ]
        ),
    },
    {
      fileName: 'SIM_04_Matriks_Capaian_BTS_Nasional.xlsx',
      title: 'Matriks Data Kinerja dan Uptime BTS Telekomunikasi Nasional 2025-2026',
      topic: 'Infrastruktur Telekomunikasi',
      format: 'XLSX',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceAgency: 'Ditjen PPI Kemenkomdigi',
      documentDate: '2026-03-20',
      description: 'Tabel statistik uptime, rasio backhaul, dan kendala operasional BTS per provinsi.',
      generateContent: async () =>
        makeSimXlsx(
          'Kinerja_BTS_Provinsi',
          ['Provinsi', 'Target_Site', 'Realisasi_On_Air', 'Uptime_Persen', 'Backhaul_Utama', 'Kendala_Dominan'],
          [
            ['Papua Pegunungan', 120, 94, '84.2%', 'Satelit VSAT', 'Pasokan BBM Solar'],
            ['Papua Selatan', 85, 78, '88.5%', 'Satelit VSAT', 'Banjir Musiman'],
            ['Maluku Barat Daya', 64, 62, '91.0%', 'Terestrial Radio IP', 'Gelombang Laut'],
            ['Kalimantan Utara', 90, 89, '96.4%', 'Serat Optik', 'Tanah Gerak'],
            ['Nusa Tenggara Timur', 140, 138, '95.1%', 'Serat Optik & Microwave', 'Petir'],
          ]
        ),
    },
    {
      fileName: 'SIM_05_Paparan_Roadmap_Broadband_2030.pptx',
      title: 'Paparan Eksekutif Roadmap Transformasi Infrastruktur Telekomunikasi Digital 2030',
      topic: 'Infrastruktur Telekomunikasi',
      format: 'PPTX',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sourceAgency: 'Bappenas & Kemenkomdigi',
      documentDate: '2026-03-25',
      description: 'Slide paparan target penetrasi fiber-to-the-home (FTTH) 70% dan pemerataan broadband nasional.',
      generateContent: () =>
        makeSimPptx(
          'Roadmap Transformasi Infrastruktur Telekomunikasi Digital 2030',
          'Bappenas & Kemenkomdigi',
          [
            {
              title: 'Visi Indonesia Terkoneksi 2030',
              bullets: [
                'Pemerataan kecepatan download minimal 100 Mbps di seluruh ibukota kabupaten/kota.',
                'Penetrasi broadband tetap (fixed broadband) mencapai 60% rumah tangga.',
                'Kemandirian industri perangkat TIK domestik dengan TKDN minimal 45%.',
              ],
            },
            {
              title: 'Tantangan Pembiayaan dan Tata Ruang',
              bullets: [
                'Kebutuhan belanja modal US$ 14,2 Miliar hingga tahun 2030.',
                'Harmonisasi regulasi retribusi sewa ruang manfaat jalan (RUMIJA) antar pemerintah daerah.',
                'Pemberian insentif fiskal pembebasan bea masuk perangkat optical line terminal.',
              ],
            },
          ]
        ),
    },

    // TEMA 2: PUSAT DATA PEMERINTAH (5 file)
    {
      fileName: 'SIM_06_Laporan_Keamanan_PDN_Cikarang.pdf',
      title: 'Laporan Audit Ketahanan Operasional dan Keamanan Siber Pusat Data Nasional 1 Cikarang',
      topic: 'Pusat Data Pemerintah',
      format: 'PDF',
      mimeType: 'application/pdf',
      sourceAgency: 'BSSN (Badan Siber dan Sandi Negara)',
      documentDate: '2026-01-28',
      description: 'Hasil penilaian standar Tier-IV, redundansi catu daya N+2, dan audit perimeter keamanan jaringan PDN Cikarang.',
      generateContent: () =>
        makeSimPdf(
          'Laporan Audit Ketahanan Operasional dan Keamanan Siber Pusat Data Nasional 1 Cikarang',
          'BSSN',
          '2026-01-28',
          [
            'Pusat Data Nasional 1 di Cikarang telah memenuhi sertifikasi Tier-IV Facility dengan ketersediaan layanan tahunan 99.995%.',
            'Namun demikian, integrasi sistem backup otomatis (disaster recovery center) dengan PDN 2 Batam masih memerlukan sinkronisasi latensi serat optik koridor interkoneksi.',
            'BSSN merekomendasikan penerapan zero-trust architecture dan audit enkripsi data-at-rest menggunakan modul kriptografi tersertifikasi nasional.',
          ]
        ),
    },
    {
      fileName: 'SIM_07_Peraturan_Standar_Interoperabilitas_SPBE.docx',
      title: 'Pedoman Kebijakan Interoperabilitas dan Klasifikasi Data Layanan SPBE',
      topic: 'Pusat Data Pemerintah',
      format: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sourceAgency: 'KemenPAN-RB & Kemenko Polkam',
      documentDate: '2026-02-10',
      description: 'Pedoman klasifikasi data terbuka, terbatas, dan rahasia negara dalam arsitektur SPBE terpusat.',
      generateContent: () =>
        makeSimDocx(
          'Pedoman Kebijakan Interoperabilitas dan Klasifikasi Data Layanan SPBE',
          'KemenPAN-RB & Kemenko Polkam',
          '2026-02-10',
          [
            'Seluruh kementerian/lembaga diwajibkan melakukan migrasi data center parsial ke PDN sesuai jadwal Perpres No. 132/2022 tentang Arsitektur SPBE.',
            'Data rahasia pertahanan dan intelijen strategis dikelola secara on-premise dedicated enclave dengan isolasi fisik air-gap.',
            'API interoperabilitas wajib mematuhi standar JSON Schema Indonesia Data Exchange (IDEX) yang terpusat di portal satu data.',
          ]
        ),
    },
    {
      fileName: 'SIM_08_Katalog_Layanan_Cloud_Pemerintah.txt',
      title: 'Katalog Layanan Komputasi Awan dan Kuota Alokasi Server Pemerintah',
      topic: 'Pusat Data Pemerintah',
      format: 'TXT',
      mimeType: 'text/plain',
      sourceAgency: 'Kemenkomdigi - Pusdatin',
      documentDate: '2026-02-18',
      description: 'Daftar paket IaaS, PaaS, dan SaaS yang disediakan secara gratis bagi instansi pusat dan daerah.',
      generateContent: async () =>
        makeSimTxt(
          'Katalog Layanan Komputasi Awan dan Kuota Alokasi Server Pemerintah',
          'Kemenkomdigi - Pusdatin',
          '2026-02-18',
          [
            'Kapasitas komputasi aktif saat ini: 12.000 vCPU, 48 TB RAM, dan 6.2 PB High-Performance NVMe Storage.',
            'Terdapat 48 kementerian dan lembaga yang telah menempatkan 312 aplikasi publik pada kluster komputasi bersama.',
            'Kebutuhan scaling untuk Pemilu dan sensus nasional memerlukan cadangan burst-capacity sebesar minimal 35%.',
          ]
        ),
    },
    {
      fileName: 'SIM_09_Matriks_Migrasi_Pusat_Data_Kementerian.xlsx',
      title: 'Tabel Monitoring Progres Migrasi Server K/L Menuju Pusat Data Nasional',
      topic: 'Pusat Data Pemerintah',
      format: 'XLSX',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceAgency: 'Kemenkomdigi & Kemenko Polkam',
      documentDate: '2026-03-05',
      description: 'Status verifikasi kelayakan migrasi 24 instansi pemerintah dan kendala legacy database.',
      generateContent: async () =>
        makeSimXlsx(
          'Monitoring_Migrasi_PDN',
          ['Nama_Instansi', 'Jumlah_Aplikasi', 'Status_Migrasi', 'Sisa_Server_Lokal', 'Kendala_Arsitektur', 'Target_Selesai'],
          [
            ['Kemenko Polkam', 18, 'Selesai 100%', 0, 'Tidak Ada', 'Jan 2026'],
            ['Kementerian Perhubungan', 42, 'Proses (72%)', 12, 'Integrasi Radar ATC', 'Okt 2026'],
            ['Kementerian Kelautan & Perikanan', 26, 'Proses (55%)', 14, 'VMS Kapal Perikanan', 'Des 2026'],
            ['Kementerian Luar Negeri', 30, 'Verifikasi Enkripsi', 28, 'Data Diplomatik Khusus', 'Mar 2027'],
            ['Lembaga Kebijakan PBJ (LKPP)', 15, 'Selesai 100%', 0, 'Tidak Ada', 'Feb 2026'],
          ]
        ),
    },
    {
      fileName: 'SIM_10_Paparan_Desain_DRC_Batam.pptx',
      title: 'Paparan Arsitektur Disaster Recovery Center PDN Batam dan IKN',
      topic: 'Pusat Data Pemerintah',
      format: 'PPTX',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sourceAgency: 'Kemenkomdigi & Otorita IKN',
      documentDate: '2026-03-18',
      description: 'Slide strategi replikasi data asinkronus dan redundansi geografis tiga titik (Cikarang - Batam - IKN).',
      generateContent: () =>
        makeSimPptx(
          'Arsitektur Disaster Recovery Center PDN Batam dan IKN',
          'Kemenkomdigi & Otorita IKN',
          [
            {
              title: 'Tri-Geographic Redundancy Strategy',
              bullets: [
                'Jarak antar lokasi > 800 km memitigasi risiko bencana gempa bumi dan cuaca katastropik serentak.',
                'Target RPO (Recovery Point Objective) < 15 menit dan RTO (Recovery Time Objective) < 1 jam.',
                'Jalur interkoneksi serat optik bawah laut mandiri berkapasitas 100 Gbps dark fiber.',
              ],
            },
            {
              title: 'Kesiapan Operasional 2026-2027',
              bullets: [
                'PDN Batam memasuki tahap mechanical & electrical fit-out (progres fisik 84%).',
                'PDN IKN dalam proses penyelesaian struktur sipil dan penguatan gardu listrik gardu ganda 150 kV.',
              ],
            },
          ]
        ),
    },

    // TEMA 3: INFRASTRUKTUR DIGITAL KAWASAN PEMERINTAHAN (5 file)
    {
      fileName: 'SIM_11_Laporan_Konektivitas_Pusat_Pemerintahan_IKN.pdf',
      title: 'Laporan Analisis Ketahanan Jaringan Komunikasi Terpadu Kawasan Pusat Pemerintahan',
      topic: 'Infrastruktur Digital Kawasan Pemerintahan',
      format: 'PDF',
      mimeType: 'application/pdf',
      sourceAgency: 'Kemenko Polkam & Otorita IKN',
      documentDate: '2026-02-05',
      description: 'Analisis jalur fiber optic Multi-Utility Tunnel (MUT) dan ketahanan proteksi jamming frekuensi.',
      generateContent: () =>
        makeSimPdf(
          'Laporan Analisis Ketahanan Jaringan Komunikasi Terpadu Kawasan Pusat Pemerintahan',
          'Kemenko Polkam & Otorita IKN',
          '2026-02-05',
          [
            'Kawasan Inti Pusat Pemerintahan (KIPP) menerapkan ducting kabel terpadu di dalam Multi-Utility Tunnel (MUT) sepanjang 28 km.',
            'Pemisahan jalur kabel telekomunikasi komersial dan jalur khusus komunikasi intelijen pertahanan telah diterapkan dengan partisi beton tahan api.',
            'Pengujian ketahanan sinyal menunjukkan perlunya penggelaran 64 micro-cell tersembunyi (camouflaged base stations) di koridor Istana Presiden dan Kantor Kemenko.',
          ]
        ),
    },
    {
      fileName: 'SIM_12_SOP_Komunikasi_Darurat_Pimpinan_Negara.docx',
      title: 'Standar Prosedur Operasional Jaringan Komunikasi Darurat Sandi Strategis',
      topic: 'Infrastruktur Digital Kawasan Pemerintahan',
      format: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sourceAgency: 'BSSN & Paspampres',
      documentDate: '2026-02-22',
      description: 'Prosedur komunikasi suara dan data terenkripsi anti-sadap bagi pimpinan negara saat situasi krisis.',
      generateContent: () =>
        makeSimDocx(
          'Standar Prosedur Operasional Jaringan Komunikasi Darurat Sandi Strategis',
          'BSSN & Paspampres',
          '2026-02-22',
          [
            'SOP ini mengatur aktivasi tautan satelit militer X-band dan radio HF frekuensi adaptif saat terjadi pemadaman listrik total (blackout) atau ancaman siber massal.',
            'Perangkat komunikasi bergerak pimpinan negara harus terdaftar dan diaudit periodik setiap 30 hari oleh Satuan Siber Kemenko Polkam.',
            'Ruang rapat pimpinan diwajibkan memiliki peredam sinyal aktif (RF Shielding Enclosure) bersertifikasi Tempest B.',
          ]
        ),
    },
    {
      fileName: 'SIM_13_Kajian_Smart_Command_Center_Pemerintahan.txt',
      title: 'Kajian Teknis Integrasi Sensor IoT dan Smart Command Center Kemenko Polkam',
      topic: 'Infrastruktur Digital Kawasan Pemerintahan',
      format: 'TXT',
      mimeType: 'text/plain',
      sourceAgency: 'Kemenko Polkam - Pusdatin',
      documentDate: '2026-03-08',
      description: 'Spesifikasi integrasi feed CCTV lalu lintas, sensor cuaca, radar maritim, dan pemantau lalu lintas spektrum.',
      generateContent: async () =>
        makeSimTxt(
          'Kajian Teknis Integrasi Sensor IoT dan Smart Command Center Kemenko Polkam',
          'Kemenko Polkam - Pusdatin',
          '2026-03-08',
          [
            'Command Center Kemenko Polkam mengintegrasikan 4.200 kamera analitik AI dan sensor pemantau spektrum frekuensi liar di wilayah ibukota.',
            'Sistem mampu mendeteksi sinyal jamming radio tak berizin dalam radius 5 km dalam waktu respons kurang dari 8 detik.',
            'Diperlukan interoperabilitas protokol streaming video dengan Pusat Komando Korlantas Polri dan Puskodal TNI.',
          ]
        ),
    },
    {
      fileName: 'SIM_14_Inventaris_Aset_Infrastruktur_Digital_KIPP.xlsx',
      title: 'Inventaris Aset Jaringan dan Perangkat Jaringan Aktif Gedung Kemenko Polkam',
      topic: 'Infrastruktur Digital Kawasan Pemerintahan',
      format: 'XLSX',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceAgency: 'Bagian Rumah Tangga & BMN Kemenko Polkam',
      documentDate: '2026-03-15',
      description: 'Data switch core, router edge, firewall generasi terbaru, dan UPS cadangan gedung kementerian.',
      generateContent: async () =>
        makeSimXlsx(
          'Aset_Jaringan_Kemenko',
          ['Perangkat', 'Merk_Tipe', 'Lokasi_Lantai', 'Kapasitas', 'Tahun_Pengadaan', 'Kondisi'],
          [
            ['Core Switch 1', 'Arista 7050SX3', 'Server Room Lt. 2', '32x 100GbE', 2025, 'Sangat Baik'],
            ['Edge Firewall', 'Fortinet FortiGate 3000F', 'Server Room Lt. 2', '100 Gbps Throughput', 2025, 'Sangat Baik'],
            ['UPS Modular A', 'Schneider Symmetra PX', 'Basement 1', '160 kVA', 2024, 'Baik (Baterai 96%)'],
            ['Wireless Controller', 'Cisco Catalyst 9800', 'Server Room Lt. 2', '500 AP Support', 2025, 'Sangat Baik'],
            ['PABX IP Sandi', 'Indonesian Defense Secure Phone', 'Ruang Sandi', '200 Line Extension', 2026, 'Sangat Baik'],
          ]
        ),
    },
    {
      fileName: 'SIM_15_Paparan_Ketahanan_Siber_Gedung_Pemerintah.pptx',
      title: 'Paparan Strategi Keamanan Fisik dan Logika Jaringan Intra Pemerintah Terpadu',
      topic: 'Infrastruktur Digital Kawasan Pemerintahan',
      format: 'PPTX',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sourceAgency: 'BSSN & Kemenko Polkam',
      documentDate: '2026-03-22',
      description: 'Slide sosialisasi segmentasi VLAN dinas, kontrol akses biometrik datacenter, dan pencegahan sniffing kabel tembaga.',
      generateContent: () =>
        makeSimPptx(
          'Strategi Keamanan Fisik dan Logika Jaringan Intra Pemerintah Terpadu',
          'BSSN & Kemenko Polkam',
          [
            {
              title: 'Segmentasi dan Isolasi Logika',
              bullets: [
                'VLAN Tamu (Guest WiFi) terisolasi mutlak dari jaringan internal dinas dan database.',
                'Otentikasi pegawai menggunakan sertifikat digital Balai Sertifikasi Elektronik (BSrE).',
                'Monitoring anomali lalu lintas data 24/7 oleh Tim Tanggap Insiden Siber (CSIRT).',
              ],
            },
            {
              title: 'Proteksi Fisik Infrastruktur Pasif',
              bullets: [
                'Manhole kabel serat optik dilengkapi sensor intrusion detection berbasis getaran.',
                'Larangan pemasangan perangkat wireless komersial tanpa izin Direktur Keamanan Informasi.',
              ],
            },
          ]
        ),
    },

    // TEMA 4: SISTEM KOMUNIKASI KABEL LAUT (5 file)
    {
      fileName: 'SIM_16_Kajian_Kerentanan_SKKL_Selat_Sunda_Malaka.pdf',
      title: 'Kajian Strategis Titik Rawan Gangguan Jangkar Kapal pada Koridor SKKL Selat Malaka dan Selat Sunda',
      topic: 'Sistem Komunikasi Kabel Laut',
      format: 'PDF',
      mimeType: 'application/pdf',
      sourceAgency: 'Kemenko Polkam & Bakamla RI',
      documentDate: '2026-01-20',
      description: 'Pemetaan 18 koridor kabel laut internasional yang rawan tersangkut jangkar kapal niaga dan aktivitas pengerukan dasar laut.',
      generateContent: () =>
        makeSimPdf(
          'Kajian Strategis Titik Rawan Gangguan Jangkar Kapal pada Koridor SKKL Selat Malaka dan Selat Sunda',
          'Kemenko Polkam & Bakamla RI',
          '2026-01-20',
          [
            'Lebih dari 85% lalu lintas internet internasional Indonesia bertumpu pada kabel bawah laut yang melintasi Selat Malaka dan Laut Natuna.',
            'Data AIS Bakamla menunjukkan tingginya frekuensi lego jangkar ilegal kapal tanker di atas koridor kabel bawah laut KM-14.',
            'Diperlukan penerbitan Notice to Mariners (NTM) yang lebih tegas dan patroli maritim terkoordinasi bersenjata di zona landing station Ancol, Batam, dan Dumai.',
          ]
        ),
    },
    {
      fileName: 'SIM_17_Rancangan_Perpres_Koridor_Pipa_Kabel_Bawah_Laut.docx',
      title: 'Harmonisasi Regulasi Penataan Koridor Alur Pipa dan Kabel Bawah Laut Nasional',
      topic: 'Sistem Komunikasi Kabel Laut',
      format: 'DOCX',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sourceAgency: 'Kemenko Kemaritiman / Polkam',
      documentDate: '2026-02-15',
      description: 'Implementasi Kepmen Kelautan dan Perikanan No. 14/2021 tentang 43 koridor pipa dan kabel laut.',
      generateContent: () =>
        makeSimDocx(
          'Harmonisasi Regulasi Penataan Koridor Alur Pipa dan Kabel Bawah Laut Nasional',
          'Kemenko Kemaritiman / Polkam',
          '2026-02-15',
          [
            'Kementerian Koordinator mengoordinasikan penertiban 38 kabel laut yang masih berada di luar koridor resmi yang ditetapkan pemerintah.',
            'Biaya perbaikan kabel laut yang putus rata-rata menelan biaya US$ 1.5 juta per insiden dan memakan waktu perbaikan 28 s.d. 45 hari.',
            'Pemerintah merencanakan pembentukan dana kompensasi asuransi infrastruktur maritim vital yang diwajibkan bagi asosiasi pelayaran.',
          ]
        ),
    },
    {
      fileName: 'SIM_18_Laporan_Insiden_Putus_Kabel_Laut_Natuna.txt',
      title: 'Kronologi dan Investigasi Teknis Insiden Putusnya SKKL Rute Batam-Pontianak',
      topic: 'Sistem Komunikasi Kabel Laut',
      format: 'TXT',
      mimeType: 'text/plain',
      sourceAgency: 'Ditjen Hubla Kemenhub & Kemenko Polkam',
      documentDate: '2026-02-28',
      description: 'Laporan insiden putusnya kabel laut serat optik segmen Natuna akibat terseret pukat harimau kapal nelayan asing.',
      generateContent: async () =>
        makeSimTxt(
          'Kronologi dan Investigasi Teknis Insiden Putusnya SKKL Rute Batam-Pontianak',
          'Ditjen Hubla Kemenhub & Kemenko Polkam',
          '2026-02-28',
          [
            'Pada 19 Februari 2026 pukul 03.14 WIB terjadi alarm total loss of signal pada kabel SKKL Batam-Pontianak di koordinat 01°12.4\' N, 106°45.2\' E.',
            'Pemeriksaan ROV (Remotely Operated Vehicle) kapal survei menemukan luka robek mekanik sepanjang 4 meter akibat garukan alat tangkap pukat dasar laut.',
            'Dampak insiden menyebabkan penurunan kapasitas bandwidth sebesar 400 Gbps menuju Kalimantan Barat selama 14 hari pemulihan rerouting.',
          ]
        ),
    },
    {
      fileName: 'SIM_19_Database_Kapal_Kabel_dan_Izin_Asing.xlsx',
      title: 'Database Kapal Penggelar Kabel Laut dan Rekomendasi Asas Cabotage',
      topic: 'Sistem Komunikasi Kabel Laut',
      format: 'XLSX',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      sourceAgency: 'Kementerian Perhubungan & Kemenko Polkam',
      documentDate: '2026-03-10',
      description: 'Daftar kapal berbendera Indonesia dan kapal asing yang memegang izin perbaikan kabel bawah laut perairan teritorial.',
      generateContent: async () =>
        makeSimXlsx(
          'Armada_Kapal_Kabel',
          ['Nama_Kapal', 'Bendera', 'Kapasitas_Tampung_Kabel', 'Posisi_Homeport', 'Status_Izin_Cabotage', 'Dukungan_TNI_AL'],
          [
            ['CS Nusantara Explorer', 'Indonesia', '3.200 Ton', 'Pelabuhan Tanjung Priok', 'Tetap (Nasional)', 'Tersedia On-Call'],
            ['CS Pacific Guardian', 'Singapura', '4.500 Ton', 'Loyang Offshore Base', 'Izin Khusus 6 Bulan', 'Pengawasan Perwira TNI'],
            ['CS Responder', 'Kepulauan Marshall', '2.800 Ton', 'Batam Port', 'Izin Perbaikan Darurat', 'Pengawasan Perwira TNI'],
            ['CS Asean Explorer', 'Indonesia', '1.800 Ton', 'Surabaya', 'Tetap (Nasional)', 'Tersedia On-Call'],
            ['CS Lodbrog', 'Prancis', '5.200 Ton', 'Singapura', 'Permohonan Baru', 'Dalam Verifikasi Intelmar'],
          ]
        ),
    },
    {
      fileName: 'SIM_20_Paparan_Diplomasi_SKKL_Internasional.pptx',
      title: 'Paparan Eksekutif Diplomasi Perlindungan Kabel Laut Lintas Batas Negara ASEAN',
      topic: 'Sistem Komunikasi Kabel Laut',
      format: 'PPTX',
      mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      sourceAgency: 'Kemenko Polkam & Kementerian Luar Negeri',
      documentDate: '2026-03-24',
      description: 'Slide inisiatif traktat kawasan ASEAN untuk pengakuan kabel bawah laut sebagai objek vital regional yang dilindungi hukum laut internasional.',
      generateContent: () =>
        makeSimPptx(
          'Diplomasi Perlindungan Kabel Laut Lintas Batas Negara ASEAN',
          'Kemenko Polkam & Kementerian Luar Negeri',
          [
            {
              title: 'Urgensi Perjanjian Regional Perlindungan SKKL',
              bullets: [
                'Kabel laut membawa 98% lalu lintas transaksi keuangan dan data strategis antar negara ASEAN.',
                'Hukum laut UNCLOS 1982 belum memberikan sanksi pidana tegas atas perusakan kabel bawah laut di zona ekonomi eksklusif.',
                'Indonesia mengusulkan mekanisme pembagian data realtime pemantauan kapal penjaga pantai (Coast Guard Joint Patrol).',
              ],
            },
            {
              title: 'Rekomendasi Aksi Diplomatik 2026',
              bullets: [
                'Membawa resolusi perlindungan infrastruktur telekomunikasi bawah air pada KTT ASEAN ke-48.',
                'Menyusun Standard Operating Procedure (SOP) pengawalan diplomatik kapal riset dan kabel laut di perairan sengketa.',
              ],
            },
          ]
        ),
    },
  ];
}

/**
 * 22. Seeds all 20 demo files idempotently into Google Drive folder 06_Data_Demo,
 * parses them into 02_Indeks_Pengetahuan, and records metadata in Sheets.
 */
export async function seedDemoDataIdempotent(
  driveService: DriveStorageService,
  sheetsRepo: SheetsRepository,
  demoFolderId: string,
  indexFolderId: string,
  spreadsheetId: string,
  ownerId: string
): Promise<{ createdCount: number; reusedCount: number; errors: string[] }> {
  const catalog = buildDemoCatalog();
  const existingDocs = await sheetsRepo.listDocuments(spreadsheetId);
  const demoDocs = existingDocs.filter((d) => d.is_demo);
  const existingByFilename = new Map(demoDocs.map((d) => [d.file_name, d]));

  let createdCount = 0;
  let reusedCount = 0;
  const errors: string[] = [];

  for (const item of catalog) {
    try {
      const existing = existingByFilename.get(item.fileName);
      if (existing) {
        // Verify file exists in Drive
        try {
          await driveService.getFileMetadata(existing.file_id);
          reusedCount++;
          continue;
        } catch {
          // File missing in drive, re-create below
        }
      }

      // Generate content buffer
      const buffer = await item.generateContent();

      // Upload file to 06_Data_Demo
      const uploadedFile = await driveService.uploadFile({
        name: item.fileName,
        mimeType: item.mimeType,
        content: buffer,
        parentId: demoFolderId,
      });

      const documentId = `doc_demo_${item.fileName.slice(0, 10).toLowerCase()}_${Date.now().toString().slice(-4)}`;

      // Parse document for RAG indexing
      const parseResult = await parseDocumentBuffer(buffer, item.fileName, item.mimeType, {
        documentId,
        fileId: uploadedFile.id,
        title: item.title,
        documentDate: item.documentDate,
        sourceAgency: item.sourceAgency,
      });

      // Save extracted chunks JSON in 02_Indeks_Pengetahuan
      const extractedFile: ExtractedDocumentFile = {
        document_id: documentId,
        file_id: uploadedFile.id,
        title: item.title,
        document_date: item.documentDate,
        source_agency: item.sourceAgency,
        mime_type: item.mimeType,
        extracted_at: new Date().toISOString(),
        ocr_required: parseResult.ocrRequired,
        notes: parseResult.notes,
        chunks: parseResult.chunks,
      };

      const extractedDriveFile = await driveService.saveJsonFile(
        `extracted_${documentId}.json`,
        extractedFile,
        indexFolderId
      );

      // Save document record in Google Sheets
      const docRecord: DocumentRecord = {
        id: documentId,
        file_id: uploadedFile.id,
        title: item.title,
        file_name: item.fileName,
        mime_type: item.mimeType,
        category_ids: JSON.stringify([item.topic]),
        source_agency: item.sourceAgency,
        document_date: item.documentDate,
        description: item.description,
        extracted_file_id: extractedDriveFile.id,
        index_version: 'v3.0',
        processing_status: parseResult.ocrRequired ? 'Memerlukan OCR' : 'Ready',
        is_demo: true,
        owner_id: ownerId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        version: 1,
      };

      await sheetsRepo.upsertEntity(spreadsheetId, 'Documents', docRecord, 'id');
      createdCount++;
    } catch (err: any) {
      errors.push(`Gagal memproses ${item.fileName}: ${err.message}`);
    }
  }

  await sheetsRepo.appendAuditLog(spreadsheetId, {
    action: 'SEED_DEMO_DATA',
    entity_type: 'DEMO',
    entity_id: 'batch_20_files',
    status: errors.length === 0 ? 'SUCCESS' : 'WARNING',
    details: `Selesai memproses demo catalog: ${createdCount} dibuat baru, ${reusedCount} sudah ada. ${errors.length} error.`,
  });

  return { createdCount, reusedCount, errors };
}

/**
 * 22. Reset only demo data without touching user's real documents.
 */
export async function resetDemoData(
  driveService: DriveStorageService,
  sheetsRepo: SheetsRepository,
  spreadsheetId: string
): Promise<{ deletedCount: number }> {
  const allDocs = await sheetsRepo.listDocuments(spreadsheetId);
  const demoDocs = allDocs.filter((d) => d.is_demo);
  let deletedCount = 0;

  for (const doc of demoDocs) {
    try {
      if (doc.file_id) {
        await driveService.deleteFile(doc.file_id);
      }
      if (doc.extracted_file_id) {
        await driveService.deleteFile(doc.extracted_file_id);
      }
    } catch {
      // ignore individual delete failure
    }
    await sheetsRepo.deleteEntity(spreadsheetId, 'Documents', doc.id, 'id');
    deletedCount++;
  }

  await sheetsRepo.appendAuditLog(spreadsheetId, {
    action: 'RESET_DEMO_DATA',
    entity_type: 'DEMO',
    entity_id: 'batch_reset',
    status: 'SUCCESS',
    details: `Berhasil mereset dan menghapus ${deletedCount} dokumen simulasi demo.`,
  });

  return { deletedCount };
}
