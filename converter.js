///// Analizador de codigo Angular en TS    


//>>>>
import { Project } from "ts-morph"
import fs from "fs"
import path from 'path'


//Asigno directorio raiz donde se ejecute independiente mente de las rutas del proyecto, es decir, que sea agnóstico al path, es decir, que le chupe la pija la ruta base 

const rootDir = process.cwd()
const tsConfigPath = path.join(rootDir, 'tsconfig.json')

//<<<< Setup Inicial


//Aca hago que el morph permita que sea posible para fs leer en archivos de ts > Inspecciona el AST (Abstract Syntax Tree), practicamente le digo lee el tsconfig e interpreta el proyecto en base a eso, puto

const project = new Project({
    tsConfigFilePath: tsConfigPath
})

//Con esto seteo ruta base del proyecto y recorro para adentro, le dice, adentro de src/app/ todos los .ts que encontres

const sourceFiles = project.addSourceFilesAtPaths(path.join(rootDir, "src/app/**/*.ts"));



//getPropertyType y getDecoratorInputs son practicamente las funciones que se encargan de seccionar los componentes y obtener los tipos de cada input/output 



const getPropertyType = (prop, cls) => {

    const initializer = prop.getInitializer();

    let rawType = prop.getType().getText(cls).replace(/import\([^)]+\)\./g, "");


    if (initializer) {

        const text = initializer.getText()


        if (text.startsWith("signal(")) {
            rawType = `Signal<${rawType}>`
        }


        if (text.startsWith("input(")) {

            const match = text.match(/input(?:\.required)?<([^>]+)>/)

            rawType = match ? `InputSignal<${match[1]}>` : `InputSignal<${rawType}>`
        }

        if (text.startsWith("output(")) {
            const match = text.match(/output<([^>]+)>/);
            rawType = match
                ? `OutputSignal<${match[1]}>`
                : `OutputSignal<${rawType}>`;
        }


    }

    return rawType;

}


//Inputs en @Components

const getDecoratorInputs = (cls) => {

    const compDecorator = cls.getDecorators().find(d => d.getName() === "Component")

    if (!compDecorator) return []

    const callExp = compDecorator.getCallExpression()

    if (!callExp) return []

    const arg = callExp.getArguments()[0];

    if (!arg || !arg.getProperty) return []


    const inputsProp = arg.getProperty("inputs")

    if (!inputsProp) return []


    const initializer = inputsProp.getInitializer()

    if (!initializer || !initializer.getElements) return []


    return initializer.getElements().map(el => ({
        name: el.getText().replace(/['"]/g, ""),
        type: "unknown"
    }))
}


// Procesamiento de los componentes y filtrado de los inputs/outputs

const allComponents = []

for (const sourceFile of sourceFiles) {

    const classes = sourceFile.getClasses();


    for (const cls of classes) {

        const isComponent = cls.getDecorators().some(d => d.getName() === 'Component')

        if (!isComponent) continue


        const inputs = cls
            .getProperties()
            .filter(p =>
                p.getDecorators().some(d => d.getName() === 'Input') ||
                (p.getInitializer() && (p.getInitializer().getText().startsWith('input') || p.getInitializer().getText().startsWith('signal(')))
            ).map(p => ({
                name: p.getName(),
                type: getPropertyType(p, cls)

            }))

        const decoratorInputs = getDecoratorInputs(cls)
        decoratorInputs.forEach(di => {
            if (!inputs.some(i => i.name === di.name)) {
                inputs.push(di)
            }
        })


        const outputs = cls
            .getProperties()
            .filter(p =>
                p.getDecorators().some(d => d.getName() === 'Output') ||
                (p.getInitializer() && (p.getInitializer().getText().startsWith('output') || p.getInitializer().getText().startsWith('signal(')))
            ).map(p => ({
                name: p.getName(),
                type: getPropertyType(p, cls)
            }))


        allComponents.push({
            component: cls.getName(),
            file: path.relative("./", sourceFile.getFilePath()),
            inputs,
            outputs
        })

    }

}


//Convierte el array en un json y lo manda a un archivo externo .json


const outputPath = path.join(rootDir, 'components.json');

fs.writeFileSync(outputPath, JSON.stringify(allComponents, null, 2))
console.log(`Metadata guardada con exito ${outputPath}`)