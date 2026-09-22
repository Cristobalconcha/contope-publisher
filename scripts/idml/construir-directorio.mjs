// Directorio «Aquí ya hay vida» rediseñado en seis páginas (8-13), sobre idml-16 ya con el pliego de casas.
// Tablas rehechas con el lenguaje del sitio (Montserrat, cabecera en versalitas doradas, filetes finos,
// sin zebra), cada categoría en una tarjeta blanca sobre tierra-50, fotos distintas por página.
import fs from 'fs';
import path from 'path';
const OUT = 'idml-16';
const R = f => fs.readFileSync(path.join(OUT, f), 'utf8');
const W = (f, s) => fs.writeFileSync(path.join(OUT, f), s, 'utf8');
let n = 0x300; const id = () => 'ux' + (n++).toString(16);
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
const DRIVE = 'file:G:/Mi%20unidad/Archivos%20de%20otras%20personas/KPI/Folleto/fotos/web-galeria/';
const DRIVE_FS = 'G:/Mi unidad/Archivos de otras personas/KPI/Folleto/fotos/web-galeria/';

// ================= 1. ESTILOS =================
const font = f => `\n\t\t\t\t<AppliedFont type="string">${f}</AppliedFont>`;
const leading = v => `\n\t\t\t\t<Leading type="unit">${v}</Leading>`;
function pstyle(name, attrs, props = '') {
  return `
		<ParagraphStyle Self="ParagraphStyle/${name}" Name="${name}" Imported="false" NextStyle="ParagraphStyle/${name}" SplitDocument="false" EmitCss="true" StyleUniqueId="${uuid()}" IncludeClass="true" ExtendedKeyboardShortcut="0 0 0" EpubAriaRole="" EmptyNestedStyles="true" EmptyLineStyles="true" EmptyGrepStyles="true" KeyboardShortcut="0 0" AppliedLanguage="$ID/Spanish: Castilian" Hyphenation="false" ${attrs}>
			<Properties>
				<BasedOn type="string">$ID/[No paragraph style]</BasedOn>
				<PreviewColor type="enumeration">Nothing</PreviewColor>${props}
			</Properties>
		</ParagraphStyle>`;
}
const PSTYLES = [
  pstyle('OCD Tabla Cabecera', 'FillColor="Color/dorado-600" FontStyle="Medium" PointSize="6.5" Tracking="120" Capitalization="AllCaps" Justification="LeftAlign"', font('Montserrat') + leading('9')),
  pstyle('OCD Tabla Nombre', 'FillColor="Color/oliva-700" FontStyle="SemiBold" PointSize="8.5" Justification="LeftAlign"', font('Montserrat') + leading('10.5')),
  pstyle('OCD Tabla Texto', 'FillColor="Color/tierra-700" FontStyle="Regular" PointSize="8" Justification="LeftAlign"', font('Montserrat') + leading('10.5')),
  pstyle('OCD Tabla Distancia', 'FillColor="Color/dorado-600" FontStyle="SemiBold" PointSize="8" Justification="LeftAlign"', font('Montserrat') + leading('10.5')),
  pstyle('OCD Tabla Contacto', 'FillColor="Color/tierra-500" FontStyle="Regular" PointSize="7" Justification="LeftAlign"', font('Montserrat') + leading('10')),
  pstyle('OCD Cierre Destacado', 'FillColor="Color/oliva-700" FontStyle="SemiBold" PointSize="12.5" Justification="LeftAlign"', font('Montserrat') + leading('17')),
];
const cell = (name, para, extra) => `
		<CellStyle Self="CellStyle/${name}" Name="${name}" ExtendedKeyboardShortcut="0 0 0" KeyboardShortcut="0 0" AppliedParagraphStyle="ParagraphStyle/${para}" VerticalJustification="TopAlign" FillColor="Swatch/None" LeftEdgeStrokeWeight="0" RightEdgeStrokeWeight="0" TopEdgeStrokeWeight="0" ${extra}>
			<Properties>
				<BasedOn type="string">$ID/[None]</BasedOn>
			</Properties>
		</CellStyle>`;
const HEAD_INS = 'TextTopInset="3" TextLeftInset="0" TextBottomInset="5" TextRightInset="6" TopInset="3" LeftInset="0" BottomInset="5" RightInset="6"';
const BODY_INS = 'TextTopInset="5" TextLeftInset="0" TextBottomInset="5" TextRightInset="6" TopInset="5" LeftInset="0" BottomInset="5" RightInset="6"';
const CSTYLES = [
  cell('OCD Celda Cabecera', 'OCD Tabla Cabecera', `${HEAD_INS} BottomEdgeStrokeWeight="0.5" BottomEdgeStrokeColor="Color/oliva-700" BottomEdgeStrokeType="StrokeStyle/$ID/Solid"`),
  cell('OCD Celda Nombre', 'OCD Tabla Nombre', `${BODY_INS} BottomEdgeStrokeWeight="0.25" BottomEdgeStrokeColor="Color/tierra-300" BottomEdgeStrokeType="StrokeStyle/$ID/Solid"`),
  cell('OCD Celda Texto', 'OCD Tabla Texto', `${BODY_INS} BottomEdgeStrokeWeight="0.25" BottomEdgeStrokeColor="Color/tierra-300" BottomEdgeStrokeType="StrokeStyle/$ID/Solid"`),
  cell('OCD Celda Distancia', 'OCD Tabla Distancia', `${BODY_INS} BottomEdgeStrokeWeight="0.25" BottomEdgeStrokeColor="Color/tierra-300" BottomEdgeStrokeType="StrokeStyle/$ID/Solid"`),
  cell('OCD Celda Contacto', 'OCD Tabla Contacto', `${BODY_INS} BottomEdgeStrokeWeight="0.25" BottomEdgeStrokeColor="Color/tierra-300" BottomEdgeStrokeType="StrokeStyle/$ID/Solid"`),
];
const TSTYLE = `
		<TableStyle Self="TableStyle/OCD Tabla Directorio" Name="OCD Tabla Directorio" CaptionPosition="AfterTable" ExtendedKeyboardShortcut="0 0 0" KeyboardShortcut="0 0" TopBorderStrokeWeight="0" BottomBorderStrokeWeight="0" LeftBorderStrokeWeight="0" RightBorderStrokeWeight="0" StartRowFillCount="0" EndRowFillCount="0" StartColumnFillCount="0" EndColumnFillCount="0" StartRowStrokeCount="0" EndRowStrokeCount="0" StartColumnStrokeCount="0" EndColumnStrokeCount="0" SpaceBefore="0" SpaceAfter="0">
			<Properties>
				<BasedOn type="string">$ID/[No table style]</BasedOn>
			</Properties>
		</TableStyle>`;
{
  let s = R('Resources/Styles.xml');
  s = s.replace('\n\t</RootParagraphStyleGroup>', PSTYLES.join('') + '\n\t</RootParagraphStyleGroup>');
  s = s.replace('\n\t</RootCellStyleGroup>', CSTYLES.join('') + '\n\t</RootCellStyleGroup>');
  s = s.replace('\n\t</RootTableStyleGroup>', TSTYLE + '\n\t</RootTableStyleGroup>');
  if (!s.includes('OCD Celda Contacto') || !s.includes('OCD Tabla Directorio')) throw new Error('estilos de tabla no insertados');
  W('Resources/Styles.xml', s);
}

// ================= 2. TABLAS =================
const COL_STYLES = ['OCD Celda Nombre', 'OCD Celda Texto', 'OCD Celda Distancia', 'OCD Celda Contacto'];
const COL_PARAS = ['OCD Tabla Nombre', 'OCD Tabla Texto', 'OCD Tabla Distancia', 'OCD Tabla Contacto'];
const CPL = [5.0, 4.6, 4.6, 3.9]; // puntos por carácter aproximados según cuerpo (para estimar altura)
function restyleTable(sid, widths) {
  const f = `Stories/Story_${sid}.xml`; let x = R(f);
  const texts = {}; // "col:row" -> texto
  // celdas
  x = x.replace(/<Cell Self="([^"]*)" Name="(\d+):(\d+)"([^>]*)>([\s\S]*?)<\/Cell>/g, (m, self, col, row, attrs, inner) => {
    const isHead = row === '0';
    const cs = isHead ? 'OCD Celda Cabecera' : COL_STYLES[+col];
    const ps = isHead ? 'OCD Tabla Cabecera' : COL_PARAS[+col];
    const keep = (/RowSpan="[^"]*" ColumnSpan="[^"]*" ColumnType="[^"]*" CellType="[^"]*"/.exec(attrs) || [''])[0];
    const content = [...inner.matchAll(/<Content>([^<]*)<\/Content>/g)].map(c => c[1]).join(' ').trim();
    texts[`${col}:${row}`] = content;
    const paras = inner.replace(/<ParagraphStyleRange[^>]*>/g, `<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${ps}">`)
      .replace(/<CharacterStyleRange[^>]*>/g, '<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">');
    return `<Cell Self="${self}" Name="${col}:${row}" ${keep} AppliedCellStyle="CellStyle/${cs}">${paras}</Cell>`;
  });
  // columnas
  let ci = 0;
  x = x.replace(/<Column Self="([^"]*)" Name="(\d+)"[^>]*\/>/g, (m, self, name) => `<Column Self="${self}" Name="${name}" ColumnType="BodyColumn" SingleColumnWidth="${widths[+name]}" />`);
  // filas: altura mínima estimada por el texto más largo de la fila
  const rows = [...x.matchAll(/<Row Self="([^"]*)" Name="(\d+)"[^>]*\/>/g)];
  let total = 0;
  x = x.replace(/<Row Self="([^"]*)" Name="(\d+)"[^>]*\/>/g, (m, self, name) => {
    const r = +name; const isHead = r === 0;
    let lines = 1;
    for (let c = 0; c < 4; c++) { const t = texts[`${c}:${r}`] || ''; const cpl = Math.max(8, Math.floor((widths[c] - 6) / (isHead ? 3.6 : CPL[c]))); lines = Math.max(lines, Math.ceil(t.length / cpl)); }
    const lead = isHead ? 9 : 10.5; const h = lines * lead + (isHead ? 8 : 10);
    total += h;
    const ins = isHead ? 'TextTopInset="3" TextLeftInset="0" TextBottomInset="5" TextRightInset="6"' : 'TextTopInset="5" TextLeftInset="0" TextBottomInset="5" TextRightInset="6"';
    return `<Row Self="${self}" Name="${name}" ${ins} ClipContentToTextCell="false" SingleRowHeight="${h}" MinimumHeight="${h}" AutoGrow="true" />`;
  });
  // tabla y párrafo contenedor
  x = x.replace(/<Table Self="([^"]*)"([^>]*)AppliedTableStyle="[^"]*"/, (m, self, rest) => `<Table Self="${self}"${rest}AppliedTableStyle="TableStyle/OCD Tabla Directorio"`);
  x = x.replace(/<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle\/OCD Lecturas">\s*<CharacterStyleRange AppliedCharacterStyle="CharacterStyle\/\$ID\/\[No character style\]" FontStyle="Black">/, '<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/OCD Tabla Texto">\n\t\t\t<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]">');
  if (!x.includes('OCD Tabla Directorio') || x.includes('Txt tabla')) throw new Error(`tabla ${sid} no quedó limpia`);
  W(f, x);
  return total * 1.06 + 6; // margen por si alguna dirección parte en más líneas
}

// ================= 3. PLANTILLAS DE ÍTEMS =================
const GEOM = (w, h) => `
			<Properties>
				<PathGeometry>
					<GeometryPathType PathOpen="false">
						<PathPointArray>
							<PathPointType Anchor="0 0" LeftDirection="0 0" RightDirection="0 0" />
							<PathPointType Anchor="0 ${h}" LeftDirection="0 ${h}" RightDirection="0 ${h}" />
							<PathPointType Anchor="${w} ${h}" LeftDirection="${w} ${h}" RightDirection="${w} ${h}" />
							<PathPointType Anchor="${w} 0" LeftDirection="${w} 0" RightDirection="${w} 0" />
						</PathPointArray>
					</GeometryPathType>
				</PathGeometry>
			</Properties>`;
const WRAP = `
			<TextWrapPreference Inverse="false" ApplyToMasterPageOnly="false" TextWrapSide="BothSides" TextWrapMode="None">
				<Properties>
					<TextWrapOffset Top="0" Left="0" Bottom="0" Right="0" />
				</Properties>
			</TextWrapPreference>`;
const COMMON = 'ParentInterfaceChangeCount="" TargetInterfaceChangeCount="" LastUpdatedInterfaceChangeCount="" OverriddenPageItemProps="" BeforeGroupingLayerPosition="-1" HorizontalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" VerticalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" FlexItemWidthMode="FlexFixed" FlexItemHeightMode="FlexFixed" GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" GradientStrokeStart="0 0" GradientStrokeLength="0" GradientStrokeAngle="0" ItemLayer="ubc" Locked="false" LocalDisplaySetting="Default" GradientFillHiliteLength="0" GradientFillHiliteAngle="0" GradientStrokeHiliteLength="0" GradientStrokeHiliteAngle="0" Visible="true" Name="$ID/"';
const CORNER = r => r ? ` CornerOption="RoundedCorner" CornerRadius="${r}" TopLeftCornerOption="RoundedCorner" TopRightCornerOption="RoundedCorner" BottomLeftCornerOption="RoundedCorner" BottomRightCornerOption="RoundedCorner" TopLeftCornerRadius="${r}" TopRightCornerRadius="${r}" BottomLeftCornerRadius="${r}" BottomRightCornerRadius="${r}"` : '';
const rect = ({ x, y, w, h, fill, radius = 0 }) => `
		<Rectangle Self="${id()}" ContentType="Unassigned" StoryTitle="$ID/" ${COMMON} FillColor="Color/${fill}" StrokeColor="Swatch/None" StrokeWeight="0"${CORNER(radius)} AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(w, h)}${WRAP}
		</Rectangle>`;
const textFrame = ({ x, y, w, h, sid }) => `
		<TextFrame Self="${id()}" ParentStory="${sid}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ${COMMON} FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(w, h)}
			<TextFramePreference TextColumnCount="1" TextColumnFixedWidth="${w}" TextColumnMaxWidth="0" VerticalJustification="TopAlign">
				<Properties>
					<InsetSpacing type="list">
						<ListItem type="unit">0</ListItem>
						<ListItem type="unit">0</ListItem>
						<ListItem type="unit">0</ListItem>
						<ListItem type="unit">0</ListItem>
					</InsetSpacing>
				</Properties>
			</TextFramePreference>${WRAP}
		</TextFrame>`;
function imageRect({ x, y, w, h, file, px, py, focusY = 0.5, radius = 5.669291338582678 }) {
  const s = Math.max(w / px, h / py); const sw = px * s, sh = py * s;
  const tx = (w - sw) / 2; let ty = (h - sh) * focusY; if (ty > 0) ty = 0; if (ty < h - sh) ty = h - sh;
  const st = fs.statSync(DRIVE_FS + file); const mtime = st.mtime.toISOString().replace(/\.\d+Z$/, ''); const ppi = Math.round(72 / s);
  return `
		<Rectangle Self="${id()}" ContentType="GraphicType" StoryTitle="$ID/" ${COMMON}${CORNER(radius)} AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(w, h)}${WRAP}
			<FrameFittingOption FittingOnEmptyFrame="FillProportionally" />
			<Image Self="${id()}" Space="$ID/#Links_RGB" ActualPpi="72 72" EffectivePpi="${ppi} ${ppi}" ImageRenderingIntent="UseColorSettings" OverriddenPageItemProps="" LocalDisplaySetting="Default" ImageTypeName="$ID/JPEG" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="${s} 0 0 ${s} ${tx} ${ty}" ParentInterfaceChangeCount="" TargetInterfaceChangeCount="" LastUpdatedInterfaceChangeCount="" BeforeGroupingLayerPosition="-1" HorizontalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" VerticalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" FlexItemWidthMode="FlexFixed" FlexItemHeightMode="FlexFixed" GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" GradientFillHiliteLength="0" GradientFillHiliteAngle="0" Visible="true" Name="$ID/">
				<Properties>
					<Profile type="string">$ID/Embedded</Profile>
					<GraphicBounds Left="0" Top="0" Right="${px}" Bottom="${py}" />
				</Properties>${WRAP.replace(/\n\t\t\t/g, '\n\t\t\t\t')}
				<Link Self="${id()}" AiGeneratedAsset="false" AiFullyGeneratedAsset="false" AiC2paArchiveData="$ID/" AssetURL="$ID/" AssetID="$ID/" RenditionData="Actual" LinkResourceURI="${DRIVE}${file}" PDFIdentifier="0" SourceObjectName="" LinkResourceFormat="$ID/JPEG" StoredState="Normal" LinkClassID="35906" LinkClientID="257" LinkResourceModified="false" LinkObjectModified="false" ShowInUI="true" CanEmbed="true" CanUnembed="true" CanPackage="true" ImportPolicy="NoAutoImport" ExportPolicy="NoAutoExport" LinkImportStamp="file 0 ${st.size}" LinkImportModificationTime="${mtime}" LinkImportTime="${new Date().toISOString().replace(/\.\d+Z$/, '')}" LinkResourceSize="0~${st.size.toString(16)}" />
				<ClippingPathSettings ClippingType="None" InvertPath="false" IncludeInsideEdges="false" RestrictToFrame="false" UseHighResolutionImage="true" Threshold="25" Tolerance="2" InsetFrame="0" AppliedPathName="$ID/" Index="-1" />
				<ImageIOPreference ApplyPhotoshopClippingPath="true" AllowAutoEmbedding="true" AlphaChannelName="$ID/" />
			</Image>
		</Rectangle>`;
}

// ================= 4. MÓDULO DE CATEGORÍA (tarjeta blanca) =================
const PAD = 18, GAP = 16, TITLE_H = 24, BAJ_LEAD = 12;
function storyLen(sid) { return [...R(`Stories/Story_${sid}.xml`).matchAll(/<Content>([^<]*)<\/Content>/g)].map(m => m[1]).join(' ').length; }
function modulo({ x, y, w, title, bajada, table, widths }) {
  const inner = w - 2 * PAD;
  const tableH = restyleTable(table, widths);
  const bajLines = Math.ceil(storyLen(bajada) / Math.floor(inner / 5.3));
  const bajH = bajLines * BAJ_LEAD + 4;
  const h = PAD + TITLE_H + 4 + bajH + 10 + tableH + PAD;
  const items = [rect({ x, y, w, h, fill: 'Paper', radius: 5.669291338582678 })];
  let cy = y + PAD;
  items.push(textFrame({ x: x + PAD, y: cy, w: inner, h: TITLE_H, sid: title })); cy += TITLE_H + 4;
  items.push(textFrame({ x: x + PAD, y: cy, w: inner, h: bajH, sid: bajada })); cy += bajH + 10;
  items.push(textFrame({ x: x + PAD, y: cy, w: inner, h: tableH, sid: table }));
  return { xml: items.join(''), h };
}
{ const f = 'Stories/Story_u58a.xml'; W(f, R(f).split('↔').join('–')); }
// las bajadas van todas en OCD Body (Activa venía en «Bajadas», Lora itálica, que el sitio ya no usa)
{ const f = 'Stories/Story_u49a.xml'; W(f, R(f).replace('ParagraphStyle/Bajadas', 'ParagraphStyle/OCD Body')); }

// ================= 5. PÁGINA 9 (pliego u35e): Silvestre + Nocturna =================
const TOP = -339.3070866141732, BOT = 353.4803149606299, PAGE_L0 = -555.3, PAGE_R0 = 28.3, PW_CONTENT = 527;
{
  let s = R('Spreads/Spread_u35e.xml');
  const cut = (tag, self) => {
    const start = s.indexOf(`<${tag} Self="${self}"`); if (start < 0) throw new Error(`${tag} ${self} no está en u35e`);
    const ls = s.lastIndexOf('\n', start);
    const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g'); re.lastIndex = start; let d = 0, m, end = -1;
    while ((m = re.exec(s))) { if (m[0].startsWith('</')) d--; else if (!m[0].endsWith('/>')) d++; if (d === 0) { end = m.index + m[0].length; break; } }
    const el = s.slice(ls, end); s = s.slice(0, ls) + s.slice(end); return el;
  };
  for (const [t, self] of [['TextFrame', 'u390'], ['TextFrame', 'u3e8'], ['TextFrame', 'u3d2'], ['TextFrame', 'u3fe'], ['Rectangle', 'u401'], ['Rectangle', 'u418']]) cut(t, self);
  const W9 = 346, X9 = 28.3, widths9 = [96, 96, 44, 74];
  const items = [];
  const m1 = modulo({ x: X9, y: TOP, w: W9, title: 'u37e', bajada: 'u3d6', table: 'u41a', widths: widths9 });
  const m2 = modulo({ x: X9, y: TOP + m1.h + GAP, w: W9, title: 'u5fb', bajada: 'u5e5', table: 'u612', widths: widths9 });
  const fondo = rect({ x: 0, y: -410, w: 626, h: 820, fill: 'tierra-50' });
  // el fondo va debajo de todo lo demás de la página derecha: se inserta justo después de las páginas
  const after = s.lastIndexOf('</Page>') + '</Page>'.length;
  s = s.slice(0, after) + fondo + s.slice(after);
  s = s.replace('\n\t</Spread>', m1.xml + m2.xml + '\n\t</Spread>');
  W('Spreads/Spread_u35e.xml', s);
  console.log('página 9: Silvestre', m1.h.toFixed(0), '+ Nocturna', m2.h.toFixed(0), '= fin en', (TOP + m1.h + GAP + m2.h).toFixed(0), '(máx', BOT, ')');
}

// ================= 6. PLIEGOS NUEVOS 10-11 y 12-13 (reemplazan a u477) =================
const COLS3 = '0 164.31496062992127 181.3228346456693 345.6377952755906 362.6456692913386 526.9606299212599';
const page = (self, x, name) => `
		<Page Self="${self}" AppliedAlternateLayout="ub5" LayoutRule="UseMaster" SnapshotBlendingMode="IgnoreLayoutSnapshots" OptionalPage="false" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 ${x} -396" Name="${name}" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="ubd" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
			<Properties>
				<Descriptor type="list">
					<ListItem type="string"></ListItem>
					<ListItem type="enumeration">Arabic</ListItem>
					<ListItem type="boolean">true</ListItem>
					<ListItem type="boolean">false</ListItem>
					<ListItem type="long">${name}</ListItem>
					<ListItem type="long">${name}</ListItem>
					<ListItem type="string"></ListItem>
				</Descriptor>
				<PageColor type="enumeration">UseMasterColor</PageColor>
			</Properties>
			<MarginPreference ColumnCount="3" ColumnGutter="17.00787401574803" Top="56.69291338582677" Bottom="42.51968503937008" Left="28.346456692913385" Right="56.69291338582677" ColumnDirection="Horizontal" ColumnsPositions="${COLS3}" />
			<GridDataInformation FontStyle="Regular" PointSize="12" CharacterAki="0" LineAki="9" HorizontalScale="100" VerticalScale="100" LineAlignment="LeftOrTopLineJustify" GridAlignment="AlignEmCenter" CharacterAlignment="AlignEmCenter">
				<Properties>
					<AppliedFont type="string">Minion Pro</AppliedFont>
				</Properties>
			</GridDataInformation>
		</Page>`;
function spread(self, pgL, pgR, nameL, nameR, ytr, items) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Spread Self="${self}" FlattenerOverride="Default" SpreadHidden="false" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 ${ytr}" ShowMasterItems="true" PageCount="2" BindingLocation="1" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium">
		<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false">
			<Properties>
				<RasterVectorBalance type="double">50</RasterVectorBalance>
			</Properties>
		</FlattenerPreference>${page(pgL, -612, nameL)}${page(pgR, 0, nameR)}${items.join('')}
	</Spread>
</idPkg:Spread>
`;
}
const widthsWide = [140, 150, 50, 151];
const fotoAlto = (fin) => Math.max(0, BOT - fin - GAP); // alto libre bajo los módulos para una foto
// --- 10-11 ---
const A = id(), A_L = id(), A_R = id();
{
  const items = [rect({ x: -626, y: -410, w: 1252, h: 820, fill: 'tierra-50' })];
  // página 10: Sabor (15 filas) a todo el ancho + foto del estero
  const sabor = modulo({ x: PAGE_L0, y: TOP, w: PW_CONTENT, title: 'u3c0', bajada: 'u3ec', table: 'u403', widths: widthsWide });
  items.push(sabor.xml);
  const libre10 = fotoAlto(TOP + sabor.h);
  if (libre10 >= 90) items.push(imageRect({ x: PAGE_L0, y: BOT - libre10, w: PW_CONTENT, h: libre10, file: 'galeria-estero.jpg', px: 1365, py: 2048, focusY: 0.55 }));
  // página 11: Descansada + Activa + caballos
  const desc = modulo({ x: PAGE_R0, y: TOP, w: PW_CONTENT, title: 'u4d5', bajada: 'u4eb', table: 'u502', widths: widthsWide });
  const act = modulo({ x: PAGE_R0, y: TOP + desc.h + GAP, w: PW_CONTENT, title: 'u484', bajada: 'u49a', table: 'u4b1', widths: widthsWide });
  items.push(desc.xml, act.xml);
  const libre11 = fotoAlto(TOP + desc.h + GAP + act.h);
  if (libre11 >= 90) items.push(imageRect({ x: PAGE_R0, y: BOT - libre11, w: PW_CONTENT, h: libre11, file: 'galeria-caballos.jpg', px: 1365, py: 2048, focusY: 0.6 }));
  console.log('página 10: Sabor', sabor.h.toFixed(0), 'foto', libre10.toFixed(0), '| página 11: Descansada', desc.h.toFixed(0), '+ Activa', act.h.toFixed(0), 'foto', libre11.toFixed(0));
  W(`Spreads/Spread_${A}.xml`, spread(A, A_L, A_R, 10, 11, 4500, items));
}
// --- 12-13 ---
const B = id(), B_L = id(), B_R = id();
{
  const items = [rect({ x: -626, y: -410, w: 1252, h: 820, fill: 'tierra-50' })];
  // página 12: Cultural + Conectada + árbol al atardecer
  const cul = modulo({ x: PAGE_L0, y: TOP, w: PW_CONTENT, title: 'u519', bajada: 'u52f', table: 'u546', widths: widthsWide });
  const con = modulo({ x: PAGE_L0, y: TOP + cul.h + GAP, w: PW_CONTENT, title: 'u573', bajada: 'u55d', table: 'u58a', widths: widthsWide });
  items.push(cul.xml, con.xml);
  const libre12 = fotoAlto(TOP + cul.h + GAP + con.h);
  if (libre12 >= 90) items.push(imageRect({ x: PAGE_L0, y: BOT - libre12, w: PW_CONTENT, h: libre12, file: 'galeria-arbol-atardecer.jpg', px: 1050, py: 1400, focusY: 0.5 }));
  // página 13: cierre. Casa en construcción arriba (familias levantando sus casas), destacado y «suma la tuya»
  items.push(imageRect({ x: PAGE_R0, y: TOP, w: PW_CONTENT, h: 300, file: 'galeria-casa-construccion.jpg', px: 1400, py: 788, focusY: 0.5 }));
  // destacado: historia nueva con el mismo texto que el de la página 9 (esa copia sigue en blanco sobre la foto)
  const dsid = id();
  W(`Stories/Story_${dsid}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Story Self="${dsid}" AiGeneratedStory="false" AiModelName="$ID/" AiDigitalSourceType="$ID/" AiFirstParty="false" AiTextContent="$ID/" AppliedTOCStyle="n" UserText="true" IsEndnoteStory="false" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">
		<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection" />
		<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />
		<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/OCD Cierre Destacado">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/OCD Vineta Dorada"><Content>[ </Content></CharacterStyleRange>
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>Aquí ya hay vida: varias familias han comenzado a levantar sus casas. Los proyectos se materializan y la vida se asienta con cada ladrillo</Content></CharacterStyleRange>
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/OCD Vineta Dorada"><Content> ]</Content></CharacterStyleRange>
		</ParagraphStyleRange>
	</Story>
</idPkg:Story>
`);
  { let dm = R('designmap.xml'); dm = dm.replace(/StoryList="([^"]*)"/, (m, l) => `StoryList="${l} ${dsid}"`); const i = dm.lastIndexOf('<idPkg:Story '); const e = dm.indexOf('\n', i); dm = dm.slice(0, e) + `\n\t<idPkg:Story src="Stories/Story_${dsid}.xml" />` + dm.slice(e); W('designmap.xml', dm); }
  items.push(textFrame({ x: PAGE_R0, y: TOP + 300 + 28, w: 300, h: 120, sid: dsid }));
  // «Aquí ya hay vida / suma la tuya» (historia u5ce, Hero alineado a la derecha) abajo a la derecha
  items.push(textFrame({ x: PAGE_R0, y: BOT - 140, w: PW_CONTENT, h: 140, sid: "u5ce" }));
  console.log('página 12: Cultural', cul.h.toFixed(0), '+ Conectada', con.h.toFixed(0), 'foto', libre12.toFixed(0));
  W(`Spreads/Spread_${B}.xml`, spread(B, B_L, B_R, 12, 13, 5500, items));
}

// ================= 7. designmap: quitar u477, poner A y B =================
{
  let dm = R('designmap.xml');
  const old = '\t<idPkg:Spread src="Spreads/Spread_u477.xml" />';
  if (!dm.includes(old)) throw new Error('u477 no está en designmap');
  dm = dm.replace(old, `\t<idPkg:Spread src="Spreads/Spread_${A}.xml" />\n\t<idPkg:Spread src="Spreads/Spread_${B}.xml" />`);
  if (!/Length="14" AlternateLayoutLength="14"/.test(dm)) throw new Error('la sección no está en 14');
  dm = dm.replace('Length="14" AlternateLayoutLength="14"', 'Length="16" AlternateLayoutLength="16"');
  W('designmap.xml', dm);
  fs.rmSync(path.join(OUT, 'Spreads/Spread_u477.xml'));
}
// historias que quedaron sin marco (foto DSCF9707 y muestras de color eran ítems, no historias): ninguna. Comprobación:
for (const sid of ['u484', 'u49a', 'u4b1', 'u4d5', 'u4eb', 'u502', 'u519', 'u52f', 'u546', 'u55d', 'u573', 'u58a', 'u5ce', 'u5e5', 'u5fb', 'u612', 'u37e', 'u3d6', 'u41a', 'u3c0', 'u3ec', 'u403']) {
  const refs = fs.readdirSync(path.join(OUT, 'Spreads')).filter(f => R('Spreads/' + f).includes(`ParentStory="${sid}"`));
  if (refs.length !== 1) throw new Error(`historia ${sid} referida por ${refs.length} pliegos`);
}
console.log('directorio v2 construido:', A, B);
