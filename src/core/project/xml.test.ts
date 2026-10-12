import * as fs from 'fs';
import { describe, expect, it } from 'vitest';
import { fixture } from './__fixtures__/scratch';
import { asArray, attr, childText, elements, isObject, lastPropertyValue, parseMsBuildXml, rootProject, textOf, XmlParseError } from './xml';

function projectOf(text: string) {
    const project = rootProject(parseMsBuildXml(text));
    if (!project) {
        throw new Error('no <Project> root');
    }
    return project;
}

const sdkProject = () => projectOf(fs.readFileSync(fixture('sdk', 'Sdk.csproj'), 'utf-8'));
const references = (project: ReturnType<typeof projectOf>) => elements(project, 'ItemGroup').flatMap(group => elements(group, 'PackageReference'));

describe('parseMsBuildXml', () => {
    it('reads a document that starts with a byte order mark', () => {
        const project = projectOf('﻿<?xml version="1.0" encoding="utf-8"?>\n<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><A>1</A></PropertyGroup></Project>');
        expect(attr(project, 'Sdk')).toBe('Microsoft.NET.Sdk');
        expect(lastPropertyValue(project, 'A')).toBe('1');
    });

    it('throws XmlParseError for malformed XML, with the file and the line', () => {
        const malformed = '<Project>\n  <ItemGroup>\n    <PackageReference Include="A" Version="1.0.0">\n  </ItemGroup>\n</Project>';
        let caught: unknown;
        try {
            parseMsBuildXml(malformed, '/w/App/App.csproj');
        } catch (error) {
            caught = error;
        }
        expect(caught).toBeInstanceOf(XmlParseError);
        const error = caught as XmlParseError;
        expect(error.name).toBe('XmlParseError');
        expect(error.filePath).toBe('/w/App/App.csproj');
        expect(error.message).toMatch(/^\/w\/App\/App\.csproj: .+ \(line \d+\)$/);
        expect(() => parseMsBuildXml('<Project><A></Project>')).toThrow(XmlParseError);
        expect(() => parseMsBuildXml('not xml at all <')).toThrow(XmlParseError);
    });

    it('omits the file from the message when none is given', () => {
        expect(() => parseMsBuildXml('<Project><A></B></Project>')).toThrow(/^(?!undefined).+\(line 1\)$/);
    });

    it('rejects an empty document and finds no project under a foreign root', () => {
        expect(() => parseMsBuildXml('')).toThrow(XmlParseError);
        expect(rootProject(parseMsBuildXml('<Configuration><A>1</A></Configuration>'))).toBeUndefined();
        expect(rootProject({ Project: 'text only' })).toBeUndefined();
    });

    it('reads an empty project as a project without content', () => {
        expect(rootProject(parseMsBuildXml('<Project></Project>'))).toEqual({});
        expect(rootProject(parseMsBuildXml('<Project />'))).toEqual({});
        expect(lastPropertyValue(projectOf('<Project></Project>'), 'A')).toBeUndefined();
    });

    it('keeps values as text and never parses numbers or booleans', () => {
        const project = projectOf('<Project><PropertyGroup><Version>1.0</Version><Flag>true</Flag></PropertyGroup></Project>');
        expect(lastPropertyValue(project, 'Version')).toBe('1.0');
        expect(lastPropertyValue(project, 'Flag')).toBe('true');
    });

    it('ignores comments, the declaration and processing instructions', () => {
        const ids = references(sdkProject()).map(reference => attr(reference, 'Include') ?? attr(reference, 'Update'));
        expect(ids).not.toContain('CommentedOut');
        expect(ids).toContain('Newtonsoft.Json');
        expect(projectOf('<?xml version="1.0"?><?pi data?><Project><!-- c --></Project>')).toEqual({});
    });
});

describe('elements, attr, childText', () => {
    it('reads a version from the attribute and from the child element', () => {
        const byId = new Map(references(sdkProject()).filter(reference => attr(reference, 'Include')).map(reference => [attr(reference, 'Include'), reference]));
        const attributeForm = byId.get('Newtonsoft.Json');
        expect(attr(attributeForm, 'Version')).toBe('13.0.3');
        expect(childText(attributeForm, 'Version')).toBeUndefined();

        const elementForm = byId.get('Microsoft.Extensions.Logging');
        expect(attr(elementForm, 'Version')).toBeUndefined();
        expect(childText(elementForm, 'Version')).toBe('8.0.0');
        expect(childText(elementForm, 'PrivateAssets')).toBe('all');

        expect(attr(byId.get('Serilog'), 'Version')).toBe('$(SerilogVersion)');
    });

    it('returns repeatable elements as arrays even when they occur once, and empty elements as objects', () => {
        const project = projectOf('<Project><ItemGroup><PackageReference Include="A" /></ItemGroup><ItemGroup /></Project>');
        const groups = elements(project, 'ItemGroup');
        expect(groups).toHaveLength(2);
        expect(elements(groups[0], 'PackageReference')).toHaveLength(1);
        expect(groups[1]).toEqual({});
        expect(elements(project, 'Missing')).toEqual([]);
        expect(elements('text', 'ItemGroup')).toEqual([]);
    });

    it('finds attributes whatever their case, as MSBuild files in the wild spell them', () => {
        const lower = references(sdkProject()).find(reference => attr(reference, 'Include') === 'Lower.Case');
        expect(attr(lower, 'Version')).toBe('1.2.3');
        expect(attr(lower, 'VERSION')).toBe('1.2.3');
        expect(attr(lower, 'Missing')).toBeUndefined();
        expect(attr(undefined, 'Include')).toBeUndefined();
    });

    it('prefers the exactly spelled attribute and reads a valueless attribute as empty', () => {
        expect(attr({ '@_version': 'lower', '@_Version': 'exact' }, 'Version')).toBe('exact');
        expect(attr({ '@_private': true }, 'Private')).toBe('');
        expect(attr({ '@_count': 3 }, 'Count')).toBeUndefined();
        // In a file a valueless attribute is not well-formed XML and never gets this far.
        expect(() => parseMsBuildXml('<Project><ItemGroup><PackageReference Include="A" Private /></ItemGroup></Project>')).toThrow(XmlParseError);
    });

    it('reads the text of an element that also has attributes, and the last of several', () => {
        const project = projectOf('<Project><PropertyGroup><V Condition="\'$(X)\' == \'\'">1.0</V><V>2.0</V><Empty /></PropertyGroup></Project>');
        const group = elements(project, 'PropertyGroup')[0];
        expect(childText(group, 'V')).toBe('2.0');
        expect(childText(group, 'Empty')).toBe('');
        expect(childText(group, 'Missing')).toBeUndefined();
        expect(childText('text', 'V')).toBeUndefined();
        expect(textOf({ '#text': '1.0', '@_Condition': 'x' })).toBe('1.0');
        expect(textOf(7)).toBeUndefined();
    });
});

describe('lastPropertyValue', () => {
    it('returns the last definition across property groups', () => {
        const project = projectOf(`<Project>
            <PropertyGroup><ManagePackageVersionsCentrally>false</ManagePackageVersionsCentrally><Only>x</Only></PropertyGroup>
            <PropertyGroup Condition="'$(CI)' == 'true'"><ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally></PropertyGroup>
        </Project>`);
        expect(lastPropertyValue(project, 'ManagePackageVersionsCentrally')).toBe('true');
        expect(lastPropertyValue(project, 'Only')).toBe('x');
        expect(lastPropertyValue(project, 'Unset')).toBeUndefined();
    });

    it('reads the properties of the fixtures', () => {
        expect(lastPropertyValue(sdkProject(), 'TargetFrameworks')).toBe('net8.0;net6.0');
        expect(lastPropertyValue(sdkProject(), 'SerilogVersion')).toBe('4.0.0');
        const central = projectOf(fs.readFileSync(fixture('cpm', 'Directory.Packages.props'), 'utf-8'));
        expect(lastPropertyValue(central, 'ManagePackageVersionsCentrally')).toBe('true');
    });
});

describe('asArray and isObject', () => {
    it('coerces to an array', () => {
        expect(asArray(undefined)).toEqual([]);
        expect(asArray(null)).toEqual([]);
        expect(asArray('a')).toEqual(['a']);
        expect(asArray(['a', 'b'])).toEqual(['a', 'b']);
    });

    it('tells objects from arrays, text and null', () => {
        expect(isObject({})).toBe(true);
        expect(isObject([])).toBe(false);
        expect(isObject(null)).toBe(false);
        expect(isObject('a')).toBe(false);
    });
});
