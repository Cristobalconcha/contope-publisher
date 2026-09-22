// Construye el pliego «Parcela + casa» (páginas 6-7) dentro de una copia del IDML
// ya corregido (carpeta idml-corregido → idml-16). No toca el original.
import fs from 'fs';
import path from 'path';

const SRC = 'idml-corregido', OUT = 'idml-16';
fs.rmSync(OUT, { recursive: true, force: true });
fs.cpSync(SRC, OUT, { recursive: true });
const R = f => fs.readFileSync(path.join(OUT, f), 'utf8');
const W = (f, s) => fs.writeFileSync(path.join(OUT, f), s, 'utf8');
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ---------- ids ----------
let n = 0x100;
const id = () => 'ux' + (n++).toString(16);
for (const f of ['designmap.xml', ...fs.readdirSync(path.join(OUT, 'Spreads')).map(x => 'Spreads/' + x)])
  if (/Self="ux[0-9a-f]+"/.test(R(f))) throw new Error('ids ux ya usados en ' + f);

// ---------- geometría (coordenadas de pliego; y crece hacia abajo) ----------
const BLEED = 14, PW = 612, PH = 792;
const TOP = -PH / 2 + 56.69291338582677, BOT = PH / 2 - 42.51968503937008;
const OUTER_L = -PW + 28.346456692913385; // margen exterior página izquierda
const DRIVE = 'file:G:/Mi%20unidad/Archivos%20de%20otras%20personas/KPI/Folleto/fotos/casas/';
const DRIVE_FS = 'G:/Mi unidad/Archivos de otras personas/KPI/Folleto/fotos/casas/';

// ---------- plantillas ----------
const GEOM = (x, y, w, h) => `
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

function rect({ x, y, w, h, fill = 'n', stroke = 'n', radius = 0, objStyle = 'ObjectStyle/$ID/[None]', extra = '' }) {
  const corner = radius ? ` CornerOption="RoundedCorner" CornerRadius="${radius}" TopLeftCornerOption="RoundedCorner" TopRightCornerOption="RoundedCorner" BottomLeftCornerOption="RoundedCorner" BottomRightCornerOption="RoundedCorner" TopLeftCornerRadius="${radius}" TopRightCornerRadius="${radius}" BottomLeftCornerRadius="${radius}" BottomRightCornerRadius="${radius}"` : '';
  return `
		<Rectangle Self="${id()}" ContentType="Unassigned" StoryTitle="$ID/" ${COMMON} FillColor="${fill === "n" ? "Swatch/None" : "Color/" + fill}" StrokeColor="Swatch/${stroke === 'n' ? 'None' : stroke}" StrokeWeight="0"${corner} AppliedObjectStyle="${objStyle}" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(x, y, w, h)}${WRAP}${extra}
		</Rectangle>`;
}

function imageRect({ x, y, w, h, file, px, py, objStyle = 'ObjectStyle/$ID/[None]', focusY = 0.5 }) {
  // encaje tipo «cubrir»: escala mínima que llena el marco, recorte centrado (focusY mueve el recorte vertical)
  const s = Math.max(w / px, h / py);
  const sw = px * s, sh = py * s;
  const tx = (w - sw) / 2;
  let ty = (h - sh) * focusY; if (ty > 0) ty = 0; if (ty < h - sh) ty = h - sh;
  const st = fs.statSync(DRIVE_FS + file);
  const mtime = st.mtime.toISOString().replace(/\.\d+Z$/, '');
  const ppi = Math.round(72 / s);
  return `
		<Rectangle Self="${id()}" ContentType="GraphicType" StoryTitle="$ID/" ${COMMON} AppliedObjectStyle="${objStyle}" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(x, y, w, h)}${WRAP}
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

const stories = []; // [id, xml]
function story(paras) {
  const sid = id();
  const body = paras.map(([style, text, over = ''], pi) => {
    const runs = Array.isArray(text) ? text : [[text]];
    const inner = runs.map(([t, cs], ri) => {
      const parts = t.split('\n').map(esc);
      let content = parts.map((p, i) => (p ? `<Content>${p}</Content>` : '') + (i < parts.length - 1 ? '<Br />' : '')).join('');
      // fin de párrafo: sin este <Br /> InDesign funde los párrafos consecutivos en uno solo (falló el 21-09)
      if (ri === runs.length - 1 && pi < paras.length - 1) content += '<Br />';
      return `\n\t\t\t<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/${cs || '$ID/[No character style]'}">${content}</CharacterStyleRange>`;
    }).join('');
    return `\n\t\t<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/${style}"${over}>${inner}\n\t\t</ParagraphStyleRange>`;
  }).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Story Self="${sid}" AiGeneratedStory="false" AiModelName="$ID/" AiDigitalSourceType="$ID/" AiFirstParty="false" AiTextContent="$ID/" AppliedTOCStyle="n" UserText="true" IsEndnoteStory="false" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">
		<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection" />
		<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />${body}
	</Story>
</idPkg:Story>
`;
  stories.push([sid, xml]);
  return sid;
}

function textFrame({ x, y, w, h, sid, fill = 'n', radius = 0, inset = [0, 0, 0, 0], vjust = 'TopAlign' }) {
  const corner = radius ? ` CornerOption="RoundedCorner" CornerRadius="${radius}" TopLeftCornerOption="RoundedCorner" TopRightCornerOption="RoundedCorner" BottomLeftCornerOption="RoundedCorner" BottomRightCornerOption="RoundedCorner" TopLeftCornerRadius="${radius}" TopRightCornerRadius="${radius}" BottomLeftCornerRadius="${radius}" BottomRightCornerRadius="${radius}"` : '';
  return `
		<TextFrame Self="${id()}" ParentStory="${sid}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ${COMMON} FillColor="${fill === "n" ? "Swatch/None" : "Color/" + fill}" StrokeColor="Swatch/None" StrokeWeight="0"${corner} AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${x} ${y}">${GEOM(x, y, w, h)}
			<TextFramePreference TextColumnCount="1" TextColumnFixedWidth="${w - inset[1] - inset[3]}" TextColumnMaxWidth="0" VerticalJustification="${vjust}">
				<Properties>
					<InsetSpacing type="list">
						<ListItem type="unit">${inset[0]}</ListItem>
						<ListItem type="unit">${inset[1]}</ListItem>
						<ListItem type="unit">${inset[2]}</ListItem>
						<ListItem type="unit">${inset[3]}</ListItem>
					</InsetSpacing>
				</Properties>
			</TextFramePreference>${WRAP}
		</TextFrame>`;
}

// ---------- estilos nuevos (Styles.xml) ----------
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
function pstyle(name, attrs, props = '') {
  return `
		<ParagraphStyle Self="ParagraphStyle/${name}" Name="${name}" Imported="false" NextStyle="ParagraphStyle/${name}" SplitDocument="false" EmitCss="true" StyleUniqueId="${uuid()}" IncludeClass="true" ExtendedKeyboardShortcut="0 0 0" EpubAriaRole="" EmptyNestedStyles="true" EmptyLineStyles="true" EmptyGrepStyles="true" KeyboardShortcut="0 0" AppliedLanguage="$ID/Spanish: Castilian" Hyphenation="false" ${attrs}>
			<Properties>
				<BasedOn type="string">$ID/[No paragraph style]</BasedOn>
				<PreviewColor type="enumeration">Nothing</PreviewColor>${props}
			</Properties>
		</ParagraphStyle>`;
}
const font = f => `\n\t\t\t\t<AppliedFont type="string">${f}</AppliedFont>`;
const leading = v => `\n\t\t\t\t<Leading type="unit">${v}</Leading>`;
const tabs = pos => `\n\t\t\t\t<TabList type="list">\n\t\t\t\t\t<ListItem type="record">\n\t\t\t\t\t\t<Alignment type="enumeration">LeftAlign</Alignment>\n\t\t\t\t\t\t<AlignmentCharacter type="string">.</AlignmentCharacter>\n\t\t\t\t\t\t<Leader type="string"></Leader>\n\t\t\t\t\t\t<Position type="unit">${pos}</Position>\n\t\t\t\t\t</ListItem>\n\t\t\t\t</TabList>`;
// Calcados de las reglas del sitio (.section__kicker, .section__title-script/-caps, .section__body,
// .modelos-incluye, .precio-gancho__*, .modelos-nota, .modelo-card__label), llevados a puntos y a fondo oliva-700.
const NEW_PSTYLES = [
  pstyle('OCD Kicker Claro', 'FillColor="Color/dorado-600" FontStyle="Medium" PointSize="8" Tracking="120" Capitalization="AllCaps" SpaceAfter="6" KeepWithNext="1" Justification="LeftAlign"', font('Montserrat') + leading('10')),
  pstyle('OCD Titulo Script Claro', 'FillColor="Color/dorado-600" FontStyle="Regular" PointSize="40" SpaceAfter="0" KeepWithNext="1" Justification="LeftAlign"', font('Birthstone') + leading('34')),
  pstyle('OCD Titulo Caps Claro', 'FillColor="Color/tierra-50" FontStyle="Bold" PointSize="19" Tracking="10" Capitalization="AllCaps" SpaceAfter="14" KeepWithNext="1" Justification="LeftAlign"', font('Montserrat') + leading('20')),
  pstyle('OCD Body Claro', 'FillColor="Color/tierra-50" FontStyle="Regular" PointSize="10" SpaceAfter="7" Justification="LeftAlign"', font('Montserrat') + leading('14')),
  pstyle('OCD Lista Claro', 'FillColor="Color/tierra-50" FontStyle="Regular" PointSize="10" LeftIndent="12" FirstLineIndent="-12" SpaceAfter="2" Justification="LeftAlign"', font('Montserrat') + leading('14') + tabs(12)),
  pstyle('OCD Etiqueta Modelo', 'FillColor="Color/dorado-600" FontStyle="SemiBold" PointSize="9" Tracking="80" Capitalization="AllCaps" SpaceAfter="2" Justification="LeftAlign"', font('Montserrat') + leading('12')),
  pstyle('OCD Precio Rotulo', 'FillColor="Color/tierra-50" FontStyle="SemiBold" PointSize="8" Tracking="140" Capitalization="AllCaps" SpaceAfter="2" Justification="LeftAlign"', font('Montserrat') + leading('10')),
  pstyle('OCD Precio Cifra', 'FillColor="Color/dorado-600" FontStyle="ExtraBold" PointSize="40" Tracking="-10" Capitalization="AllCaps" SpaceAfter="4" Justification="LeftAlign"', font('Montserrat') + leading('40')),
  pstyle('OCD Precio Pie', 'FillColor="Color/tierra-300" FontStyle="Regular" PointSize="7.5" Tracking="60" Capitalization="AllCaps" SpaceAfter="0" Justification="LeftAlign"', font('Montserrat') + leading('10')),
  pstyle('OCD Pastilla', 'FillColor="Color/oliva-700" FontStyle="Bold" PointSize="7" Tracking="160" Capitalization="AllCaps" Justification="CenterAlign"', font('Montserrat') + leading('8')),
  pstyle('OCD Legal Claro', 'FillColor="Color/tierra-300" FontStyle="Light" PointSize="6.5" SpaceBefore="8" SpaceAfter="0" Justification="LeftAlign"', font('Montserrat') + leading('8.5')),
];
const NEW_CSTYLE = `
		<CharacterStyle Self="CharacterStyle/OCD Vineta Dorada" Imported="false" SplitDocument="false" EmitCss="true" StyleUniqueId="${uuid()}" IncludeClass="true" ExtendedKeyboardShortcut="0 0 0" EpubAriaRole="" KeyboardShortcut="0 0" Name="OCD Vineta Dorada" FillColor="Color/dorado-600" FontStyle="Bold">
			<Properties>
				<BasedOn type="string">$ID/[No character style]</BasedOn>
				<PreviewColor type="enumeration">Nothing</PreviewColor>
			</Properties>
		</CharacterStyle>`;
{
  let s = R('Resources/Styles.xml');
  if (!s.includes('</RootParagraphStyleGroup>') || !s.includes('</RootCharacterStyleGroup>')) throw new Error('Styles.xml sin grupos raíz');
  s = s.replace('\n\t</RootParagraphStyleGroup>', NEW_PSTYLES.join('') + '\n\t</RootParagraphStyleGroup>');
  s = s.replace('\n\t</RootCharacterStyleGroup>', NEW_CSTYLE + '\n\t</RootCharacterStyleGroup>');
  W('Resources/Styles.xml', s);
}

// ---------- contenido (texto del sitio, sección «Construye tu casa») ----------
const V = (t) => [t, 'OCD Vineta Dorada'];
const incluye = ['Tres modelos de vivienda para elegir.', 'Diseño y desarrollo arquitectónico.', 'Planos y proyectos de especialidades.', 'Gestión de permisos municipales.', 'Tramitación ante el Servicio de Impuestos Internos.', 'Construcción de la vivienda.', 'Gestión de la recepción final.'];
const columna = story([
  ['OCD Kicker Claro', 'CONSTRUYE TU CASA'],
  ['OCD Titulo Script Claro', 'Aquí ya está el lugar.'],
  ['OCD Titulo Caps Claro', 'AHORA SUMA TU CASA'],
  ['OCD Body Claro', 'En Santa Luisa los caminos ya existen, la infraestructura está instalada y los sistemas están funcionando. Además de elegir tu parcela, puedes acceder a una solución integral para construir tu casa.'],
  ['OCD Body Claro', 'Santa Luisa pone a disposición de sus propietarios tres modelos de viviendas prediseñadas y una solución integral para acompañar el proceso completo, desde el proyecto arquitectónico hasta la recepción final.'],
  ['OCD Body Claro', 'Cada alternativa contempla el desarrollo arquitectónico, los proyectos de especialidades, la gestión de permisos municipales y ante el Servicio de Impuestos Internos, la construcción y la recepción final de la vivienda.'],
  ...incluye.map(t => ['OCD Lista Claro', [V('•\t'), [t]]]),
  ['OCD Body Claro', 'El servicio es opcional, se contrata a solicitud de cada propietario y se desarrolla específicamente para su parcela.', ' SpaceBefore="6"'],
  ['OCD Legal Claro', 'Los modelos corresponden a viviendas por construir y no a casas terminadas disponibles para entrega inmediata. Santa Luisa no financia la construcción. Los valores y condiciones están sujetos a las características del terreno, las especificaciones del proyecto y la forma de pago acordada. *Valor referencial. Los precios y modelos de casas pueden cambiar sin previo aviso, quedando la inmobiliaria exenta de cualquier responsabilidad por dichas modificaciones.'],
]);
const precioRotulo = story([['OCD Precio Rotulo', 'PARCELA + CASA DESDE']]);
const precioCifra = story([['OCD Precio Cifra', '8.150 UF*']]);
const precioPie = story([['OCD Precio Pie', 'MODELO VALLE SOBRE PARCELA DESDE 3.590 UF']]);
const pastilla = story([['OCD Pastilla', '¡MÁS SIMPLE!']]);
const capLadera = story([['OCD Etiqueta Modelo', 'LADERA · 215 m²'], ['OCD Body Claro', 'Vivienda prediseñada de dos pisos.']]);
const capValle = story([
  ['OCD Etiqueta Modelo', 'VALLE · 140 m²', ' Justification="RightAlign"'],
  ['OCD Body Claro', 'Vivienda prediseñada de un piso.', ' Justification="RightAlign" SpaceAfter="4"'],
  ['OCD Etiqueta Modelo', 'CORDILLERA · 248 m² · PRÓXIMAMENTE', ' Justification="RightAlign" FillColor="Color/tierra-300"'],
]);

// ---------- ítems del pliego ----------
const items = [];
// fondo oliva a sangre en todo el pliego
items.push(rect({ x: -PW - BLEED, y: -PH / 2 - BLEED, w: 2 * PW + 2 * BLEED, h: PH + 2 * BLEED, fill: 'oliva-700' }));
// foto de la fachada (web, 1300×2800) a la derecha, a sangre
const FX = 110;
items.push(imageRect({ x: FX, y: -PH / 2 - BLEED, w: PW + BLEED - FX, h: PH + 2 * BLEED, file: 'casa-fachada-web.jpg', px: 1300, py: 2800, focusY: 1 }));
// Ladera (mayor) arriba, entrando sobre la foto
const LX = -300, LW = 570, LH = LW * 480 / 864, LY = TOP;
items.push(imageRect({ x: LX, y: LY, w: LW, h: LH, file: 'modelo-ladera-5s.jpg', px: 864, py: 480, objStyle: 'ObjectStyle/Puntas redondeadas' }));
// Valle (menor) abajo
const VW = 500, VH = VW * 486 / 864, VX = -300, VY = BOT - VH;
items.push(imageRect({ x: VX, y: VY, w: VW, h: VH, file: 'modelo-valle-10s.jpg', px: 864, py: 486, objStyle: 'ObjectStyle/Puntas redondeadas' }));
// leyendas entre los dos cuadros: Ladera a la izquierda bajo su cuadro; Valle y Cordillera a la derecha sobre el de Valle
items.push(textFrame({ x: LX, y: LY + LH + 8, w: 230, h: 30, sid: capLadera }));
items.push(textFrame({ x: FX - 262, y: VY - 48, w: 250, h: 44, sid: capValle }));
// columna de texto (página izquierda)
const CX = OUTER_L, CW = LX - 30 - OUTER_L, CY = TOP;
const PRECIO_H = 100;
items.push(textFrame({ x: CX, y: CY, w: CW, h: BOT - PRECIO_H - 10 - CY, sid: columna }));
// bloque de precio al pie de la columna
let py = BOT - PRECIO_H;
items.push(textFrame({ x: CX, y: py, w: CW, h: 12, sid: precioRotulo })); py += 14;
items.push(textFrame({ x: CX, y: py, w: CW, h: 42, sid: precioCifra })); py += 44;
items.push(textFrame({ x: CX, y: py, w: 82, h: 15, sid: pastilla, fill: 'dorado-600', radius: 7.5, inset: [3.5, 6, 3, 6], vjust: 'CenterAlign' })); py += 20;
items.push(textFrame({ x: CX, y: py, w: CW, h: 12, sid: precioPie }));

// ---------- archivo del pliego ----------
const spreadId = id(), pgL = id(), pgR = id();
const page = (self, x, name, cols, colsPos, rule) => `
		<Page Self="${self}" AppliedAlternateLayout="ub5" LayoutRule="${rule}" SnapshotBlendingMode="IgnoreLayoutSnapshots" OptionalPage="false" GeometricBounds="0 0 792 612" ItemTransform="1 0 0 1 ${x} -396" Name="${name}" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="ubd" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
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
			<MarginPreference ColumnCount="${cols}" ColumnGutter="17.00787401574803" Top="56.69291338582677" Bottom="42.51968503937008" Left="28.346456692913385" Right="56.69291338582677" ColumnDirection="Horizontal" ColumnsPositions="${colsPos}" />
			<GridDataInformation FontStyle="Regular" PointSize="12" CharacterAki="0" LineAki="9" HorizontalScale="100" VerticalScale="100" LineAlignment="LeftOrTopLineJustify" GridAlignment="AlignEmCenter" CharacterAlignment="AlignEmCenter">
				<Properties>
					<AppliedFont type="string">Minion Pro</AppliedFont>
				</Properties>
			</GridDataInformation>
		</Page>`;
const COLS3 = '0 164.31496062992127 181.3228346456693 345.6377952755906 362.6456692913386 526.9606299212599';
const spreadXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Spread Self="${spreadId}" FlattenerOverride="Default" SpreadHidden="false" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 2500" ShowMasterItems="true" PageCount="2" BindingLocation="1" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium">
		<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false">
			<Properties>
				<RasterVectorBalance type="double">50</RasterVectorBalance>
			</Properties>
		</FlattenerPreference>${page(pgL, -612, 6, 3, COLS3, 'UseMaster')}${page(pgR, 0, 7, 3, COLS3, 'UseMaster')}${items.join('')}
	</Spread>
</idPkg:Spread>
`;
W(`Spreads/Spread_${spreadId}.xml`, spreadXml);
for (const [sid, xml] of stories) W(`Stories/Story_${sid}.xml`, xml);

// ---------- designmap ----------
{
  let dm = R('designmap.xml');
  const anchor = '\t<idPkg:Spread src="Spreads/Spread_u286.xml" />';
  if (!dm.includes(anchor)) throw new Error('no encuentro el pliego u286 en designmap');
  dm = dm.replace(anchor, anchor + `\n\t<idPkg:Spread src="Spreads/Spread_${spreadId}.xml" />`);
  dm = dm.replace(/StoryList="([^"]*)"/, (m, l) => `StoryList="${l} ${stories.map(s => s[0]).join(' ')}"`);
  dm = dm.replace(/<Section Self="ub5" Length="12" AlternateLayoutLength="12"/, '<Section Self="ub5" Length="14" AlternateLayoutLength="14"');
  if (!dm.includes('Length="14"')) throw new Error('no pude actualizar la sección');
  const lastStory = dm.lastIndexOf('<idPkg:Story ');
  const eol = dm.indexOf('\n', lastStory);
  dm = dm.slice(0, eol) + stories.map(s => `\n\t<idPkg:Story src="Stories/Story_${s[0]}.xml" />`).join('') + dm.slice(eol);
  W('designmap.xml', dm);
}
console.log('pliego', spreadId, 'páginas', pgL, pgR, 'historias', stories.length, 'ítems', items.length);
console.log('Ladera', LX, LY, LW, LH.toFixed(1), '| Valle', VX, VY.toFixed(1), VW, VH.toFixed(1), '| columna', CX.toFixed(1), CW.toFixed(1));
