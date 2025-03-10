import { Message, CommandDef } from '../lib/types';
import Fuse from 'fuse.js';
import neo4j from 'neo4j-driver';
import config from '../config.json';
import systems from '../data/systems.json';

export function printSecurity(system: { Security: number }) {
  if (system.Security >= 0.5) {
    return `(HS ${system.Security})`
  } else if (system.Security > 0) {
    return `(LS ${system.Security})`;
  }
  return `(NS ${system.Security})`;
}

export const fuse = new Fuse(systems, {
  keys: [
    'Name',
  ],
});

export function getSystems(message: Message, args: { start: string; end: string }) {
  const startSearch = fuse.search(args.start);
  if (startSearch.length == 0) {
    message.channel.send(`Could not find any system matching '${args.start}'`);
    return;
  }
  const start = startSearch[0].item.Name;

  const endSearch = fuse.search(args.end);
  if (endSearch.length == 0) {
    message.channel.send(`Could not find any system matching '${args.end}'`);
    return;
  }
  const end = endSearch[0].item.Name;

  if (start === end) {
    message.channel.send(`That's the same system!`);
    return;
  }
  return {
    start: startSearch[0].item,
    end: endSearch[0].item,
  }
}

const command: CommandDef = {
  name: 'jumps',
  alias: ['jumps', 'j'],
  args: [{
    name: 'start',
  },{
    name: 'end',
  }],
  help: {
    description: 'This command will return the shortest jump distance to travel between two given systems within New Eden as well as the lowest security rating along the route.',
  },
  handler: async (message: Message, args: { start: string; end: string; }) => {
    const systems = getSystems(message, args);
    if (!systems) return;

    const driver = neo4j.driver(config.neo4j.uri,
      neo4j.auth.basic(config.neo4j.username, config.neo4j.password));
    const session = driver.session();
    try {
      const results = await session.run(`
        MATCH (start:System {name: '${systems.start.Name}'}),(end:System {name:'${systems.end.Name}'})
        MATCH path = shortestPath((start)-[:GATES_TO*]-(end))
        RETURN length(path), path
      `);
      let lowest = 1;
      for (const segment of (results.records[0] as any)._fields[1].segments) {
        if (segment.start.properties.security < lowest) {
          lowest = segment.start.properties.security;
        }
        if (segment.end.properties.security < lowest) {
          lowest = segment.end.properties.security;
        }
      }
      return message.channel.send(`**${(results.records[0] as any)._fields[0].low}** ${systems.start.Name}${printSecurity(systems.start)} - ${systems.end.Name}${printSecurity(systems.end)} travels through ${printSecurity({Security: lowest})}`);
    } finally {
      await session.close();
      await driver.close();
    }
  }
};

export default command;
