import { Database } from '../src/database';
import {
  ArticyData,
  ArticyObjectProps,
  DisplayNameProps,
  FeatureProps,
  ModelData,
  TemplateProps,
  TemplateTypeDefinition,
} from '../src/json';
import { LocalizeDefinition, LocalizeProperties } from '../src/localization';

// Raw database JSON
const UnitData: ArticyData = require('./unit.articy.json');

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
    // Load english language
    await database.localization.load('en', './test/loc_All objects_en.xlsx');

    // Load french language
    await database.localization.load('fr', './test/loc_All objects_fr.xlsx');
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
});
