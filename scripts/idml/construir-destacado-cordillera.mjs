// Documento InDesign independiente con el destacado «Cordillera · próximamente» (opción 1):
// la caja oliva-100 del sitio, con los estilos y muestras del folleto. Una página de 260×140 pt.
import fs from 'fs';
import path from 'path';
const SRC = 'idml-16', OUT = 'idml-cordillera';
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'Spreads'), { recursive: true }); fs.mkdirSync(path.join(OUT, 'Stories'));
for (const d of ['META-INF', 'Resources', 'XML', 'MasterSpreads']) fs.cpSync(path.join(SRC, d), path.join(OUT, d), { recursive: true });
fs.copyFileSync(path.join(SRC, 'mimetype'), path.join(OUT, 'mimetype'));
const R = f => fs.readFileSync(path.join(OUT, f), 'utf8');
const W = (f, s) => fs.writeFileSync(path.join(OUT, f), s, 'utf8');
const uuid = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });

const PW = 260, PH = 140, PAD = 14;

// ---- estilo nuevo: «PRÓXIMAMENTE» (calcado de .modelo-card__media--placeholder del sitio, a escala de impreso)
{
  let s = R('Resources/Styles.xml');
  s = s.replace('\n\t</RootParagraphStyleGroup>', `
		<ParagraphStyle Self="ParagraphStyle/OCD Proximamente" Name="OCD Proximamente" Imported="false" NextStyle="ParagraphStyle/OCD Proximamente" SplitDocument="false" EmitCss="true" StyleUniqueId="${uuid()}" IncludeClass="true" ExtendedKeyboardShortcut="0 0 0" EpubAriaRole="" EmptyNestedStyles="true" EmptyLineStyles="true" EmptyGrepStyles="true" KeyboardShortcut="0 0" AppliedLanguage="$ID/Spanish: Castilian" Hyphenation="false" FillColor="Color/oliva-700" FontStyle="SemiBold" PointSize="18" Tracking="50" Capitalization="AllCaps" SpaceAfter="6" Justification="LeftAlign">
			<Properties>
				<BasedOn type="string">$ID/[No paragraph style]</BasedOn>
				<PreviewColor type="enumeration">Nothing</PreviewColor>
				<AppliedFont type="string">Montserrat</AppliedFont>
				<Leading type="unit">20</Leading>
			</Properties>
		</ParagraphStyle>
	</RootParagraphStyleGroup>`);
  W('Resources/Styles.xml', s);
}
// ---- preferencias: tamaño de página, sin caras enfrentadas, sin sangrado
{
  let p = R('Resources/Preferences.xml');
  p = p.replace('PageHeight="792"', `PageHeight="${PH}"`).replace('PageWidth="612"', `PageWidth="${PW}"`).replace('FacingPages="true"', 'FacingPages="false"')
    .replace(/DocumentBleed(Top|Bottom|InsideOrLeft|OutsideOrRight)Offset="[^"]*"/g, 'DocumentBleed$1Offset="0"');
  W('Resources/Preferences.xml', p);
}
// ---- historia
const SID = 'ucd01';
W(`Stories/Story_${SID}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Story xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Story Self="${SID}" AiGeneratedStory="false" AiModelName="$ID/" AiDigitalSourceType="$ID/" AiFirstParty="false" AiTextContent="$ID/" AppliedTOCStyle="n" UserText="true" IsEndnoteStory="false" TrackChanges="false" StoryTitle="$ID/" AppliedNamedGrid="n">
		<StoryPreference OpticalMarginAlignment="false" OpticalMarginSize="12" FrameType="TextFrameType" StoryOrientation="Horizontal" StoryDirection="LeftToRightDirection" />
		<InCopyExportOption IncludeGraphicProxies="true" IncludeAllResources="false" />
		<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/OCD Etiqueta Modelo" SpaceAfter="8">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>CORDILLERA · 248 m²</Content><Br /></CharacterStyleRange>
		</ParagraphStyleRange>
		<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/OCD Proximamente">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>Próximamente</Content><Br /></CharacterStyleRange>
		</ParagraphStyleRange>
		<ParagraphStyleRange AppliedParagraphStyle="ParagraphStyle/OCD Body">
			<CharacterStyleRange AppliedCharacterStyle="CharacterStyle/$ID/[No character style]"><Content>El modelo más amplio de la familia. Consulta su avance.</Content></CharacterStyleRange>
		</ParagraphStyleRange>
	</Story>
</idPkg:Story>
`);
// ---- pliego de una página con la tarjeta y el texto
const COMMON = 'ParentInterfaceChangeCount="" TargetInterfaceChangeCount="" LastUpdatedInterfaceChangeCount="" OverriddenPageItemProps="" BeforeGroupingLayerPosition="-1" HorizontalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" VerticalLayoutConstraints="FlexibleDimension FixedDimension FlexibleDimension" FlexItemWidthMode="FlexFixed" FlexItemHeightMode="FlexFixed" GradientFillStart="0 0" GradientFillLength="0" GradientFillAngle="0" GradientStrokeStart="0 0" GradientStrokeLength="0" GradientStrokeAngle="0" ItemLayer="ubc" Locked="false" LocalDisplaySetting="Default" GradientFillHiliteLength="0" GradientFillHiliteAngle="0" GradientStrokeHiliteLength="0" GradientStrokeHiliteAngle="0" Visible="true" Name="$ID/"';
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
const r = 5.669291338582678;
// la página de una sola cara tiene su origen en su esquina superior izquierda (ItemTransform de la página 0 -PH/2 … se usa el mismo esquema que el folleto: centro del pliego)
const X0 = -PW / 2, Y0 = -PH / 2;
const items = `
		<Rectangle Self="ucd10" ContentType="Unassigned" StoryTitle="$ID/" ${COMMON} FillColor="Color/oliva-100" StrokeColor="Swatch/None" StrokeWeight="0" CornerOption="RoundedCorner" CornerRadius="${r}" TopLeftCornerOption="RoundedCorner" TopRightCornerOption="RoundedCorner" BottomLeftCornerOption="RoundedCorner" BottomRightCornerOption="RoundedCorner" TopLeftCornerRadius="${r}" TopRightCornerRadius="${r}" BottomLeftCornerRadius="${r}" BottomRightCornerRadius="${r}" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${X0} ${Y0}">${GEOM(PW, PH)}${WRAP}
		</Rectangle>
		<TextFrame Self="ucd11" ParentStory="${SID}" PreviousTextFrame="n" NextTextFrame="n" ContentType="TextType" ${COMMON} FillColor="Swatch/None" StrokeColor="Swatch/None" StrokeWeight="0" AppliedObjectStyle="ObjectStyle/$ID/[None]" ItemTransform="1 0 0 1 ${X0 + PAD} ${Y0 + PAD}">${GEOM(PW - 2 * PAD, PH - 2 * PAD)}
			<TextFramePreference TextColumnCount="1" TextColumnFixedWidth="${PW - 2 * PAD}" TextColumnMaxWidth="0" VerticalJustification="CenterAlign">
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
W('Spreads/Spread_ucd00.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<idPkg:Spread xmlns:idPkg="http://ns.adobe.com/AdobeInDesign/idml/1.0/packaging" DOMVersion="21.5">
	<Spread Self="ucd00" FlattenerOverride="Default" SpreadHidden="false" AllowPageShuffle="true" ItemTransform="1 0 0 1 0 0" ShowMasterItems="true" PageCount="1" BindingLocation="0" PageTransitionType="None" PageTransitionDirection="NotApplicable" PageTransitionDuration="Medium">
		<FlattenerPreference LineArtAndTextResolution="300" GradientAndMeshResolution="150" ClipComplexRegions="false" ConvertAllStrokesToOutlines="false" ConvertAllTextToOutlines="false">
			<Properties>
				<RasterVectorBalance type="double">50</RasterVectorBalance>
			</Properties>
		</FlattenerPreference>
		<Page Self="ucd02" AppliedAlternateLayout="ub5" LayoutRule="Off" SnapshotBlendingMode="IgnoreLayoutSnapshots" OptionalPage="false" GeometricBounds="0 0 ${PH} ${PW}" ItemTransform="1 0 0 1 ${X0} ${Y0}" Name="1" AppliedTrapPreset="TrapPreset/$ID/kDefaultTrapStyleName" OverrideList="" AppliedMaster="n" MasterPageTransform="1 0 0 1 0 0" TabOrder="" GridStartingPoint="TopOutside" UseMasterGrid="true">
			<Properties>
				<Descriptor type="list">
					<ListItem type="string"></ListItem>
					<ListItem type="enumeration">Arabic</ListItem>
					<ListItem type="boolean">true</ListItem>
					<ListItem type="boolean">false</ListItem>
					<ListItem type="long">1</ListItem>
					<ListItem type="long">1</ListItem>
					<ListItem type="string"></ListItem>
				</Descriptor>
				<PageColor type="enumeration">UseMasterColor</PageColor>
			</Properties>
			<MarginPreference ColumnCount="1" ColumnGutter="12" Top="0" Bottom="0" Left="0" Right="0" ColumnDirection="Horizontal" ColumnsPositions="0 ${PW}" />
			<GridDataInformation FontStyle="Regular" PointSize="12" CharacterAki="0" LineAki="9" HorizontalScale="100" VerticalScale="100" LineAlignment="LeftOrTopLineJustify" GridAlignment="AlignEmCenter" CharacterAlignment="AlignEmCenter">
				<Properties>
					<AppliedFont type="string">Minion Pro</AppliedFont>
				</Properties>
			</GridDataInformation>
		</Page>${items}
	</Spread>
</idPkg:Spread>
`);
// ---- designmap: mismo encabezado del folleto, con un solo pliego y una historia
{
  let dm = fs.readFileSync(path.join(SRC, 'designmap.xml'), 'utf8');
  dm = dm.replace(/StoryList="[^"]*"/, `StoryList="${SID} u99"`).replace(/Name="Santa_Luisa_Folleto_Limpio\.indd"/, 'Name="Destacado_Cordillera.indd"');
  dm = dm.replace(/\n\t<idPkg:Spread src="[^"]*" \/>/g, '').replace(/\n\t<idPkg:Story src="[^"]*" \/>/g, '');
  dm = dm.replace('\t<idPkg:MasterSpread src="MasterSpreads/MasterSpread_u1b2.xml" />', `\t<idPkg:MasterSpread src="MasterSpreads/MasterSpread_u1b2.xml" />\n\t<idPkg:Spread src="Spreads/Spread_ucd00.xml" />`);
  dm = dm.replace(/<Section Self="ub5" Length="16" AlternateLayoutLength="16"([^>]*)PageStart="u1c2"/, '<Section Self="ub5" Length="1" AlternateLayoutLength="1"$1PageStart="ucd02"');
  // las historias van después de los pliegos, como en el folleto original; antes, InDesign no las carga
  dm = dm.replace('\t<idPkg:BackingStory src="XML/BackingStory.xml" />', `\t<idPkg:Story src="Stories/Story_${SID}.xml" />\n\t<idPkg:BackingStory src="XML/BackingStory.xml" />`);
  if (!dm.includes('Spread_ucd00') || !dm.includes(`Story_${SID}`) || !dm.includes('PageStart="ucd02"')) throw new Error('designmap incompleto');
  W('designmap.xml', dm);
}
console.log('destacado construido en', OUT);
