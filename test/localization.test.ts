import { Database } from '../src/database';
import { FlowFragment } from '../src/flowTypes';
import Excel from 'exceljs';
import {
  ArticyData,
  ArticyObjectProps,
  DisplayNameProps,
  EnumDefinition,
  FeatureProps,
  ModelData,
  TemplateProps,
  TemplateTypeDefinition,
} from '../src/json';
import { LocalizeDefinition, LocalizeProperties } from '../src/localization';

// Raw database JSON
const UnitData: ArticyData = require('./unit.articy.json');

// XLSX loader
async function loadXlsx(filename: string): Promise<Record<string, string>> {
  // Load workbook
  const workbook = new Excel.Workbook();
  await workbook.xlsx.readFile(filename);

  // Get the appropriate worksheet
  const stringWorksheet = workbook.getWorksheet('ArticyStrings');

  // Create language map from rows
  const localizationMap: Record<string, string> = {};
  stringWorksheet.getColumn(1).eachCell((cell, row) => {
    localizationMap[cell.text] = stringWorksheet.getCell(
      row,
      cell.col + 1
    ).text;
  });

  // Return
  return localizationMap;
}

const myTemplateDefinition: TemplateTypeDefinition = {
  Class: 'DialogueFragment',
  Type: 'DialogueFragment',
  Template: {
    TechnicalName: 'MyTemplate',
    DisplayName: '$Enum.Sex.Female.DisplayName',
    Features: [
      {
        TechnicalName: 'MyFeature',
        DisplayName: '$Enum.Sex.Female.DisplayName',
        Properties: [
          {
            Property: 'localizedText',
            DisplayName: '$Enum.Sex.Female.DisplayName',
            Type: 'string',
            Localizable: true,
          },
          {
            Property: 'unlocalizedText',
            DisplayName: '$Enum.Sex.Female.DisplayName',
            Type: 'string',
            Localizable: false,
          },
        ],
      },
    ],
  },
};

interface MyFeature extends FeatureProps {
  localizedText: string;
  unlocalizedText: string;
}
interface MyTemplate extends TemplateProps {
  MyFeature: MyFeature;
}

describe('A project with two languages: French and English', () => {
  // Load database
  const database = new Database(UnitData as ArticyData);

  beforeAll(async () => {
    // Load languages
    const en = await loadXlsx('./test/loc_All objects_en.xlsx');
    const fr = await loadXlsx('./test/loc_All objects_fr.xlsx');

    // Store in localization file
    database.localization.load('en', en);
    database.localization.load('fr', fr);
  });

  beforeEach(() => {
    // Make sure english is active
    database.localization.active = 'en';
  });

  test('Can localize an ID into active language', () => {
    expect(database.localization.get('FFr_10EB377E.DisplayName')).toBe(
      'Text Node'
    );
  });

  test('Can localize an ID into other languages', () => {
    expect(database.localization.get('FFr_10EB377E.DisplayName', 'fr')).toBe(
      'French Node'
    );
  });

  test('Can change active language', () => {
    database.localization.active = 'fr';
    expect(database.localization.get('FFr_10EB377E.DisplayName')).toBe(
      'French Node'
    );
  });

  test('Can proxy object properties', () => {
    const props: DisplayNameProps & ArticyObjectProps = {
      DisplayName: 'FFr_10EB377E.DisplayName',
      Id: '0x0',
      TechnicalName: '',
    };

    // Create proxy
    const proxy = LocalizeProperties(
      props,
      database.localization
    ) as typeof props;

    expect(proxy.DisplayName).toBe('Text Node');
  });

  test('Can proxy template properties', () => {
    const template: MyTemplate = {
      MyFeature: {
        localizedText: 'FFr_10EB377E.DisplayName',
        unlocalizedText: 'UnlocalizedText',
      },
    };

    const proxy = LocalizeProperties(
      template,
      database.localization,
      myTemplateDefinition
    ) as typeof template;

    expect(proxy.MyFeature.localizedText).toBe('Text Node');
    expect(proxy.MyFeature.unlocalizedText).toBe(
      template.MyFeature.unlocalizedText
    );
  });

  test('Can proxy template definition information', () => {
    const proxy = LocalizeDefinition(
      myTemplateDefinition,
      database.localization
    ) as typeof myTemplateDefinition;
    expect(proxy.Template.DisplayName).toBe('Female');
    expect(proxy.Template.Features[0].DisplayName).toBe('Female');
    expect(proxy.Template.Features[0].Properties[0].DisplayName).toBe('Female');
  });

  test('Can proxy entire articy objects', () => {
    const obj: ModelData<DisplayNameProps & ArticyObjectProps, MyTemplate> = {
      Type: 'DialogueFragment',
      Properties: {
        DisplayName: 'FFr_10EB377E.DisplayName',
        Id: '0x0',
        TechnicalName: '',
      },
      Template: {
        MyFeature: {
          localizedText: 'FFr_10EB377E.DisplayName',
          unlocalizedText: 'UnlocalizedText',
        },
      },
    };

    const proxy = LocalizeProperties(
      obj,
      database.localization,
      myTemplateDefinition
    ) as typeof obj;

    expect(proxy.Properties.DisplayName).toBe('Text Node');
    expect(proxy.Template?.MyFeature.localizedText).toBe('Text Node');
    expect(proxy.Template?.MyFeature.unlocalizedText).toBe(
      obj.Template?.MyFeature.unlocalizedText
    );
  });

  test('Database automatically proxies objects', () => {
    const frag = database.getObject('0x010000000000010F', FlowFragment);
    expect(frag).toBeDefined();
    if (!frag) {
      return;
    }

    expect(frag.properties.DisplayName).toBe('Text Node');
  });

  test('Changing language updates existing objects from database', () => {
    const frag = database.getObject('0x010000000000010F', FlowFragment);
    expect(frag).toBeDefined();
    if (!frag) {
      return;
    }

    expect(frag.properties.DisplayName).toBe('Text Node');
    database.localization.active = 'fr';
    expect(frag.properties.DisplayName).toBe('French Node');
  });

  test('Enum names are localized when accessed through database', () => {
    expect(database.getEnumValueDisplayName('Sex', 1)).toBe('Female');
    expect(
      (database.getDefinition('Sex') as EnumDefinition)?.DisplayNames['Female']
    ).toBe('Female');
  });
});
