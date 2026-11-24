import { describe, expect, it } from "vitest";
import { locate } from "@/lib/gazetteer";
import { KNOWN_LOCATION_ACC } from "@/lib/publicCall";

describe("locate (nomenclátor de Málaga)", () => {
  it("reconoce una calle con número y lo conserva", () => {
    const r = locate("Soy vecino de la calle Cuarteles 14, en El Perchel. Se ha inundado.");
    expect(r).not.toBeNull();
    expect(r!.location_text).toBe("Calle Cuarteles 14");
    expect(r!.place).toBe("El Perchel");
    expect(r!.aml.acc).toBe(KNOWN_LOCATION_ACC);
    expect(r!.aml.lat).toBeCloseTo(36.7155, 3);
    expect(r!.aml.lng).toBeCloseTo(-4.429, 3);
  });

  it("no pega números que no son del portal", () => {
    expect(locate("En la calle Larios, somos 4 personas")!.location_text).toBe("Calle Larios");
    expect(locate("calle Larios 3 coches parados")!.location_text).toBe("Calle Larios");
    expect(locate("calle Victoria, número 12")!.location_text).toBe("Calle Victoria 12");
  });

  it("ignora mayúsculas, tildes y alias en inglés u otros idiomas", () => {
    expect(locate("HELP at the CAMPANILLAS TUNNEL")!.place).toBe("Campanillas");
    expect(locate("Avenida de ANDALUCIA near El Corte Ingles")!.location_text).toBe("Avenida de Andalucía");
    expect(locate("Torremolinos, near the station")!.place).toBe("Torremolinos");
    expect(locate("Rincon de la Victoria")!.place).toBe("Rincón de la Victoria");
    expect(locate("smoke on Larios street")!.place).toBe("Calle Larios");
    expect(locate("Teatinos residence")!.place).toBe("Teatinos");
  });

  it("prefiere la coincidencia más específica", () => {
    // «Victoria» de Rincón de la Victoria no es la calle Victoria.
    expect(locate("garaje en Rincón de la Victoria, avenida del Mediterráneo")!.place).toBe("Rincón de la Victoria");
    // Paso inferior de la A-357 gana a Campanillas a secas.
    const r = locate("coche en el paso inferior de la A-357, en Campanillas");
    expect(r!.location_text).toBe("Paso inferior A-357, Campanillas");
    expect(r!.aml.lat).toBeCloseTo(36.716, 3);
  });

  it("devuelve null si no hay ningún lugar conocido", () => {
    expect(locate("")).toBeNull();
    expect(locate("hay un problema en mi calle")).toBeNull();
    expect(locate("asdf qwer 1234")).toBeNull();
  });

  it("todas las coordenadas caen dentro del mapa", () => {
    for (const t of ["larios", "alameda principal", "plaza de la merced", "calle victoria", "calle cuarteles", "avenida de andalucia", "cruz de humilladero", "paseo maritimo", "teatinos", "campanillas", "aeropuerto de malaga", "torremolinos", "el palo", "rincon de la victoria"]) {
      const r = locate(t)!;
      expect(r, t).not.toBeNull();
      expect(r.aml.lat).toBeGreaterThan(36.59);
      expect(r.aml.lat).toBeLessThan(36.77);
      expect(r.aml.lng).toBeGreaterThan(-4.6);
      expect(r.aml.lng).toBeLessThan(-4.24);
    }
  });

  it("las palabras comunes sueltas no cuentan como lugar conocido", () => {
    for (const t of [
      "hay un olor raro en un rincón del garaje",
      "hay agua en la alameda de mi casa",
      "el puerto de montaña está cortado",
      "the port of the router is broken",
      "estamos en el centro comercial",
      "el airport shuttle no llega",
      "hay mucho aeropuerto de juguete",
      "se oye una merced rara",
    ]) {
      expect(locate(t), t).toBeNull();
    }
  });

  it("los alias específicos siguen funcionando", () => {
    expect(locate("en el puerto de Málaga")!.place).toBe("Alameda Principal");
    expect(locate("Malaga port is flooded")!.place).toBe("Alameda Principal");
    expect(locate("cerca de la alameda principal")!.place).toBe("Alameda Principal");
    expect(locate("en el aeropuerto de Málaga")!.place).toBe("Aeropuerto de Málaga");
    expect(locate("Malaga airport terminal 3")!.place).toBe("Aeropuerto de Málaga");
    expect(locate("en el centro de Málaga")!.place).toBe("Málaga centro");
    expect(locate("en el centro histórico")!.place).toBe("Málaga centro");
  });
});
